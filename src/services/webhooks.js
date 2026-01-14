/**
 * Webhook Service
 * Handles webhook management, triggering, and logging
 */
import crypto from 'crypto';
import { supabaseAdmin, isDemoMode } from '../config/supabase.js';

// Available webhook events
export const WEBHOOK_EVENTS = {
  // Order events
  'order.created': 'New order created',
  'order.paid': 'Order payment received',
  'order.confirmed': 'Order confirmed',
  'order.processing': 'Order processing started',
  'order.shipped': 'Order shipped',
  'order.delivered': 'Order delivered',
  'order.cancelled': 'Order cancelled',
  'order.refunded': 'Order refunded',
  
  // Product events
  'product.created': 'New product created',
  'product.updated': 'Product updated',
  'product.deleted': 'Product deleted',
  'product.low_stock': 'Product stock is low',
  'product.out_of_stock': 'Product out of stock',
  'product.back_in_stock': 'Product back in stock',
  
  // Customer events
  'customer.registered': 'New customer registered',
  'customer.first_purchase': 'Customer made first purchase',
  'customer.updated': 'Customer profile updated',
  
  // Inventory events
  'inventory.adjusted': 'Inventory manually adjusted',
  'inventory.critical': 'Critical stock level reached',
  
  // Promotion events
  'promotion.started': 'Promotion started',
  'promotion.ended': 'Promotion ended',
  'promotion.depleted': 'Promotion uses depleted',
  
  // Cart events
  'cart.abandoned': 'Cart abandoned (24h+)',
  'cart.recovered': 'Abandoned cart recovered'
};

// Demo webhooks
const demoWebhooks = [
  {
    id: 'demo-webhook-1',
    name: 'n8n-orders',
    url: 'https://n8n.example.com/webhook/orders',
    secret: 'demo-secret-123',
    events: ['order.created', 'order.paid', 'order.shipped'],
    headers: { 'X-Custom-Header': 'ModhuStore' },
    is_active: true,
    failure_count: 0
  },
  {
    id: 'demo-webhook-2',
    name: 'slack-alerts',
    url: 'https://hooks.slack.com/services/xxx',
    secret: null,
    events: ['product.low_stock', 'order.cancelled'],
    headers: {},
    is_active: true,
    failure_count: 0
  }
];

// In-memory webhook logs for demo mode
const webhookLogs = [];

/**
 * Get all webhooks
 */
export async function getWebhooks() {
  if (isDemoMode) {
    return demoWebhooks;
  }
  
  const { data, error } = await supabaseAdmin
    .from('webhooks')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

/**
 * Get webhook by ID
 */
export async function getWebhookById(id) {
  if (isDemoMode) {
    return demoWebhooks.find(w => w.id === id) || null;
  }
  
  const { data, error } = await supabaseAdmin
    .from('webhooks')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data;
}

/**
 * Create a new webhook
 */
export async function createWebhook(webhookData) {
  const secret = webhookData.secret || crypto.randomBytes(32).toString('hex');
  
  if (isDemoMode) {
    return { success: true, message: '(Demo) Webhook created', secret };
  }
  
  const { data, error } = await supabaseAdmin
    .from('webhooks')
    .insert({
      name: webhookData.name,
      url: webhookData.url,
      secret,
      events: webhookData.events || [],
      headers: webhookData.headers || {},
      is_active: webhookData.is_active !== false
    })
    .select()
    .single();
  
  if (error) throw error;
  return { success: true, data, secret };
}

/**
 * Update a webhook
 */
export async function updateWebhook(id, webhookData) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Webhook updated' };
  }
  
  const updateData = {};
  if (webhookData.name !== undefined) updateData.name = webhookData.name;
  if (webhookData.url !== undefined) updateData.url = webhookData.url;
  if (webhookData.events !== undefined) updateData.events = webhookData.events;
  if (webhookData.headers !== undefined) updateData.headers = webhookData.headers;
  if (webhookData.is_active !== undefined) updateData.is_active = webhookData.is_active;
  
  const { error } = await supabaseAdmin
    .from('webhooks')
    .update(updateData)
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(id) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Webhook deleted' };
  }
  
  const { error } = await supabaseAdmin
    .from('webhooks')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * Trigger webhooks for an event
 */
export async function trigger(event, payload) {
  console.log(`🎣 Webhook trigger: ${event}`, payload?.id || '');
  
  let webhooks;
  
  if (isDemoMode) {
    webhooks = demoWebhooks.filter(w => 
      w.is_active && w.events.includes(event)
    );
  } else {
    const { data } = await supabaseAdmin
      .from('webhooks')
      .select('*')
      .contains('events', [event])
      .eq('is_active', true);
    
    webhooks = data || [];
  }
  
  if (webhooks.length === 0) {
    console.log(`   No webhooks registered for ${event}`);
    return { triggered: 0 };
  }
  
  const timestamp = Date.now();
  const results = [];
  
  for (const webhook of webhooks) {
    const body = {
      event,
      timestamp,
      webhook_id: webhook.id,
      data: payload
    };
    
    // Generate signature if secret exists
    const signature = webhook.secret 
      ? generateSignature(body, webhook.secret) 
      : null;
    
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'ModhuWebhook/1.0',
      'X-Modhu-Event': event,
      'X-Modhu-Timestamp': timestamp.toString(),
      'X-Modhu-Delivery': crypto.randomUUID(),
      ...(signature && { 'X-Modhu-Signature': `sha256=${signature}` }),
      ...(webhook.headers || {})
    };
    
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      const success = response.ok;
      const statusCode = response.status;
      
      // Log the delivery
      await logWebhookDelivery(webhook.id, {
        event,
        success,
        status_code: statusCode,
        response_time: Date.now() - timestamp
      });
      
      if (success) {
        console.log(`   ✅ ${webhook.name}: ${statusCode}`);
        
        // Reset failure count on success
        if (!isDemoMode) {
          await supabaseAdmin
            .from('webhooks')
            .update({ 
              last_triggered_at: new Date().toISOString(),
              failure_count: 0
            })
            .eq('id', webhook.id);
        }
      } else {
        console.log(`   ❌ ${webhook.name}: ${statusCode}`);
        await handleWebhookFailure(webhook);
      }
      
      results.push({ webhook: webhook.name, success, statusCode });
      
    } catch (error) {
      console.error(`   ❌ ${webhook.name}: ${error.message}`);
      
      await logWebhookDelivery(webhook.id, {
        event,
        success: false,
        error: error.message,
        response_time: Date.now() - timestamp
      });
      
      await handleWebhookFailure(webhook);
      
      results.push({ webhook: webhook.name, success: false, error: error.message });
    }
  }
  
  return { triggered: webhooks.length, results };
}

/**
 * Handle webhook failure (increment counter, disable if too many failures)
 */
async function handleWebhookFailure(webhook) {
  const newFailureCount = (webhook.failure_count || 0) + 1;
  
  if (isDemoMode) {
    webhook.failure_count = newFailureCount;
    return;
  }
  
  const updateData = { failure_count: newFailureCount };
  
  // Disable webhook after 5 consecutive failures
  if (newFailureCount >= 5) {
    updateData.is_active = false;
    console.log(`   ⚠️ Webhook ${webhook.name} disabled after 5 failures`);
  }
  
  await supabaseAdmin
    .from('webhooks')
    .update(updateData)
    .eq('id', webhook.id);
}

/**
 * Log webhook delivery attempt
 */
async function logWebhookDelivery(webhookId, data) {
  if (isDemoMode) {
    webhookLogs.push({
      webhook_id: webhookId,
      ...data,
      created_at: new Date().toISOString()
    });
    // Keep only last 100 logs in demo mode
    if (webhookLogs.length > 100) webhookLogs.shift();
    return;
  }
  
  await supabaseAdmin
    .from('webhook_logs')
    .insert({
      webhook_id: webhookId,
      event: data.event,
      success: data.success,
      status_code: data.status_code,
      error: data.error,
      response_time: data.response_time
    });
}

/**
 * Get webhook logs
 */
export async function getWebhookLogs(webhookId = null, limit = 50) {
  if (isDemoMode) {
    let logs = [...webhookLogs].reverse();
    if (webhookId) {
      logs = logs.filter(l => l.webhook_id === webhookId);
    }
    return logs.slice(0, limit);
  }
  
  let query = supabaseAdmin
    .from('webhook_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (webhookId) {
    query = query.eq('webhook_id', webhookId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Test a webhook by sending a test payload
 */
export async function testWebhook(webhookId) {
  const webhook = await getWebhookById(webhookId);
  
  if (!webhook) {
    return { success: false, error: 'Webhook not found' };
  }
  
  const testPayload = {
    test: true,
    message: 'This is a test webhook from Modhu Honey Store',
    timestamp: new Date().toISOString()
  };
  
  const timestamp = Date.now();
  const body = {
    event: 'test.ping',
    timestamp,
    webhook_id: webhook.id,
    data: testPayload
  };
  
  const signature = webhook.secret 
    ? generateSignature(body, webhook.secret) 
    : null;
  
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ModhuWebhook/1.0',
        'X-Modhu-Event': 'test.ping',
        'X-Modhu-Timestamp': timestamp.toString(),
        ...(signature && { 'X-Modhu-Signature': `sha256=${signature}` }),
        ...(webhook.headers || {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
    
    return {
      success: response.ok,
      status_code: response.status,
      response_time: Date.now() - timestamp
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      response_time: Date.now() - timestamp
    };
  }
}

/**
 * Retry failed webhooks
 */
export async function retryFailedWebhooks() {
  if (isDemoMode) return { retried: 0 };
  
  const { data: failedWebhooks } = await supabaseAdmin
    .from('webhooks')
    .select('*')
    .eq('is_active', false)
    .gt('failure_count', 0)
    .lt('failure_count', 10);
  
  if (!failedWebhooks || failedWebhooks.length === 0) {
    return { retried: 0 };
  }
  
  let retriedCount = 0;
  
  for (const webhook of failedWebhooks) {
    const result = await testWebhook(webhook.id);
    
    if (result.success) {
      await supabaseAdmin
        .from('webhooks')
        .update({ is_active: true, failure_count: 0 })
        .eq('id', webhook.id);
      
      retriedCount++;
    }
  }
  
  return { retried: retriedCount };
}

export default {
  WEBHOOK_EVENTS,
  getWebhooks,
  getWebhookById,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  trigger,
  testWebhook,
  getWebhookLogs,
  retryFailedWebhooks
};
