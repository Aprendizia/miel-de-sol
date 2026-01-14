/**
 * API Authentication Middleware
 * Handles API key authentication, rate limiting, and permissions
 */
import crypto from 'crypto';
import { supabaseAdmin, isDemoMode } from '../config/supabase.js';

// In-memory rate limiting (use Redis in production for multi-instance)
const rateLimitStore = new Map();

// Demo API keys for testing
const demoApiKeys = [
  {
    id: 'demo-key-1',
    name: 'n8n-automation',
    prefix: 'modhu_nw',
    permissions: ['read:*', 'write:orders', 'write:inventory'],
    rate_limit: 1000,
    is_active: true
  },
  {
    id: 'demo-key-2',
    name: 'respond-io-bot',
    prefix: 'modhu_rs',
    permissions: ['read:customers', 'read:orders', 'read:products'],
    rate_limit: 500,
    is_active: true
  }
];

/**
 * Generate a new API key
 */
export function generateApiKey() {
  const key = `modhu_${crypto.randomBytes(24).toString('hex')}`;
  const prefix = key.substring(0, 10);
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, prefix, keyHash };
}

/**
 * Hash an API key for storage/comparison
 */
export function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * API Authentication middleware
 */
export async function apiAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  // Check for API key in header or query param
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query.api_key) {
    token = req.query.api_key;
  }
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'missing_token',
      message: 'API key required. Use Authorization: Bearer <key> header'
    });
  }
  
  try {
    let apiKey = null;
    
    if (isDemoMode) {
      // Demo mode: check against demo keys
      const prefix = token.substring(0, 10);
      apiKey = demoApiKeys.find(k => k.prefix === prefix);
    } else {
      // Production: verify against database
      const prefix = token.substring(0, 10);
      const keyHash = hashApiKey(token);
      
      const { data, error } = await supabaseAdmin
        .from('api_keys')
        .select('*')
        .eq('prefix', prefix)
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .single();
      
      if (!error && data) {
        apiKey = data;
        
        // Update last used timestamp
        await supabaseAdmin
          .from('api_keys')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', data.id);
      }
    }
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'invalid_token',
        message: 'Invalid or expired API key'
      });
    }
    
    // Check expiration
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'expired_token',
        message: 'API key has expired'
      });
    }
    
    // Rate limiting
    const rateLimitResult = checkRateLimit(apiKey);
    if (!rateLimitResult.allowed) {
      res.setHeader('X-RateLimit-Limit', apiKey.rate_limit);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime);
      
      return res.status(429).json({
        success: false,
        error: 'rate_limit_exceeded',
        message: `Rate limit exceeded. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)} seconds`,
        retry_after: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
      });
    }
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', apiKey.rate_limit);
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimitResult.resetTime);
    
    // Attach API key info to request
    req.apiKey = apiKey;
    next();
    
  } catch (error) {
    console.error('API auth error:', error);
    return res.status(500).json({
      success: false,
      error: 'auth_error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Check rate limit for an API key
 */
function checkRateLimit(apiKey) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const limit = apiKey.rate_limit || 100;
  
  const key = `ratelimit:${apiKey.id}`;
  let record = rateLimitStore.get(key);
  
  if (!record || now > record.resetTime) {
    record = {
      count: 0,
      resetTime: now + windowMs
    };
  }
  
  record.count++;
  rateLimitStore.set(key, record);
  
  return {
    allowed: record.count <= limit,
    remaining: Math.max(0, limit - record.count),
    resetTime: record.resetTime
  };
}

/**
 * Permission checking middleware
 * Usage: requirePermission('read:products', 'write:products')
 */
export function requirePermission(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: 'unauthorized',
        message: 'API key required'
      });
    }
    
    const userPermissions = req.apiKey.permissions || [];
    
    // Check if user has wildcard permission
    if (userPermissions.includes('*')) {
      return next();
    }
    
    // Check for specific permissions
    const hasPermission = requiredPermissions.some(required => {
      // Direct match
      if (userPermissions.includes(required)) return true;
      
      // Wildcard match (e.g., read:* matches read:products)
      const [action, resource] = required.split(':');
      if (userPermissions.includes(`${action}:*`)) return true;
      if (userPermissions.includes(`*:${resource}`)) return true;
      
      return false;
    });
    
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'forbidden',
        message: `Insufficient permissions. Required: ${requiredPermissions.join(' or ')}`
      });
    }
    
    next();
  };
}

/**
 * Optional API auth - doesn't fail if no key provided
 */
export async function optionalApiAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.apiKey = null;
    return next();
  }
  
  // If token provided, validate it
  return apiAuth(req, res, next);
}

export default {
  apiAuth,
  requirePermission,
  optionalApiAuth,
  generateApiKey,
  hashApiKey
};
