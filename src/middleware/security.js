/**
 * Security Middleware - Rate Limiting, CSRF, Validation
 */
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';

// ===========================================
// RATE LIMITERS
// ===========================================

// General API rate limiter
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    error: 'Demasiadas solicitudes, por favor intenta más tarde.',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: {
    error: 'Demasiados intentos de acceso. Por favor espera 15 minutos.',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

// Checkout rate limiter
export const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 checkout attempts per hour
  message: {
    error: 'Demasiados intentos de compra. Por favor espera una hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin operations limiter
export const adminLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 operations per 5 minutes
  message: {
    error: 'Demasiadas operaciones. Por favor espera unos minutos.',
  },
});

// ===========================================
// VALIDATION MIDDLEWARE
// ===========================================

// Handle validation errors
export const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const isAjax = req.xhr || req.headers.accept?.includes('application/json');
    
    if (isAjax) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(e => e.msg)
      });
    }
    
    req.session.error = errors.array().map(e => e.msg).join('. ');
    return res.redirect('back');
  }
  next();
};

// ===========================================
// VALIDATORS - AUTH
// ===========================================

export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Contraseña requerida'),
  handleValidation
];

export const validateRegister = [
  body('full_name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Nombre debe tener entre 2 y 100 caracteres')
    .escape(),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Contraseña debe tener al menos 8 caracteres')
    .matches(/\d/)
    .withMessage('Contraseña debe contener al menos un número'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Teléfono inválido'),
  handleValidation
];

// ===========================================
// VALIDATORS - CART
// ===========================================

export const validateAddToCart = [
  body('productId')
    .notEmpty()
    .withMessage('ID de producto requerido'),
  body('quantity')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Cantidad debe ser entre 1 y 100'),
  handleValidation
];

export const validateUpdateCart = [
  body('productId')
    .notEmpty()
    .withMessage('ID de producto requerido'),
  body('quantity')
    .isInt({ min: 0, max: 100 })
    .withMessage('Cantidad debe ser entre 0 y 100'),
  handleValidation
];

// ===========================================
// VALIDATORS - CHECKOUT
// ===========================================

export const validateCheckout = [
  body('first_name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Nombre debe tener entre 2 y 50 caracteres')
    .escape(),
  body('last_name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Apellido debe tener entre 2 y 50 caracteres')
    .escape(),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Teléfono inválido'),
  body('address')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Dirección debe tener entre 5 y 200 caracteres')
    .escape(),
  body('city')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Ciudad inválida')
    .escape(),
  body('state')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Estado/Provincia inválido')
    .escape(),
  body('postal_code')
    .trim()
    .isLength({ min: 4, max: 10 })
    .withMessage('Código postal inválido')
    .escape(),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notas no pueden exceder 500 caracteres')
    .escape(),
  handleValidation
];

// ===========================================
// VALIDATORS - ADMIN PRODUCTS
// ===========================================

export const validateProduct = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Nombre del producto debe tener entre 2 y 255 caracteres'),
  body('slug')
    .trim()
    .isLength({ min: 2, max: 255 })
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug solo puede contener letras minúsculas, números y guiones'),
  body('category_id')
    .optional({ nullable: true })
    .isUUID()
    .withMessage('Categoría inválida'),
  body('price')
    .isFloat({ min: 0.01, max: 999999.99 })
    .withMessage('Precio debe ser mayor a 0'),
  body('sale_price')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0.01, max: 999999.99 })
    .withMessage('Precio de oferta inválido'),
  body('stock_quantity')
    .isInt({ min: 0, max: 99999 })
    .withMessage('Stock debe ser un número entre 0 y 99999'),
  body('weight')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Peso no puede exceder 50 caracteres'),
  body('short_description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Descripción corta no puede exceder 500 caracteres'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Descripción no puede exceder 5000 caracteres'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('Estado activo inválido'),
  body('is_featured')
    .optional()
    .isBoolean()
    .withMessage('Estado destacado inválido'),
  handleValidation
];

// ===========================================
// VALIDATORS - ADMIN ORDERS
// ===========================================

export const validateOrderUpdate = [
  param('id')
    .isUUID()
    .withMessage('ID de pedido inválido'),
  body('status')
    .optional()
    .isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'])
    .withMessage('Estado de pedido inválido'),
  body('payment_status')
    .optional()
    .isIn(['pending', 'paid', 'failed', 'refunded'])
    .withMessage('Estado de pago inválido'),
  body('tracking_number')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Número de tracking no puede exceder 100 caracteres'),
  body('tracking_url')
    .optional({ checkFalsy: true })
    .trim()
    .isURL()
    .withMessage('URL de tracking inválida'),
  body('admin_notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notas no pueden exceder 1000 caracteres'),
  handleValidation
];

// ===========================================
// VALIDATORS - SEARCH
// ===========================================

export const validateSearch = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Búsqueda debe tener entre 2 y 100 caracteres')
    .escape(),
  query('category')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .escape(),
  query('sort')
    .optional()
    .isIn(['newest', 'price-low', 'price-high', 'name'])
    .withMessage('Ordenamiento inválido'),
  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Página inválida'),
  handleValidation
];

// ===========================================
// ENV VALIDATION
// ===========================================

export function validateEnv() {
  const warnings = [];
  const errors = [];
  
  // Required in production (but don't exit on Vercel)
  const isVercel = process.env.VERCEL || process.env.NOW_REGION;
  
  if (process.env.NODE_ENV === 'production' && !isVercel) {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      errors.push('SESSION_SECRET debe tener al menos 32 caracteres en producción');
    }
  }
  
  // Warnings for missing optional services
  if (!process.env.SUPABASE_URL || process.env.SUPABASE_URL === 'https://tu-proyecto.supabase.co') {
    warnings.push('SUPABASE_URL no configurado - usando modo DEMO');
  }
  
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
    warnings.push('STRIPE_SECRET_KEY no configurado - pagos deshabilitados');
  }
  
  if (!process.env.GEMINI_API_KEY) {
    warnings.push('GEMINI_API_KEY no configurado - generación de imágenes deshabilitada');
  }
  
  // Log warnings (only if not in Vercel to avoid log spam)
  if (!isVercel) {
    warnings.forEach(w => console.log(`⚠️  ${w}`));
  }
  
  // Don't exit on Vercel - just log errors
  if (errors.length > 0) {
    errors.forEach(e => console.error(`❌ ${e}`));
    if (!isVercel) {
      process.exit(1);
    }
  }
  
  return { warnings, errors };
}

export default {
  generalLimiter,
  authLimiter,
  checkoutLimiter,
  adminLimiter,
  validateLogin,
  validateRegister,
  validateAddToCart,
  validateUpdateCart,
  validateCheckout,
  validateProduct,
  validateOrderUpdate,
  validateSearch,
  validateEnv
};
