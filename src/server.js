import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import security middleware
import { generalLimiter, validateEnv } from './middleware/security.js';

// Validate environment variables (don't exit on Vercel)
try {
  validateEnv();
} catch (e) {
  console.warn('ENV validation warning:', e.message);
}

// Import routes
import indexRoutes from './routes/index.js';
import shopRoutes from './routes/shop.js';
import cartRoutes from './routes/cart.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import apiV1Routes from './routes/api-v1.js';
import shippingRoutes from './routes/shipping.js';

// ES Module dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ===========================================
// MIDDLEWARE
// ===========================================

// Compression
app.use(compression());

// Security headers with proper CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://*.supabase.co", "https://api.envia.com", "https://cdn.jsdelivr.net"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://checkout.stripe.com"],
      formAction: ["'self'", "https://rincondelamiel.com", "https://checkout.stripe.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
app.use(generalLimiter);

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing - Raw for Stripe webhooks
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

// Body parsing - JSON and URL encoded
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookies (signed with secret for cart storage)
const cookieSecret = process.env.SESSION_SECRET || 'dev-secret-change-in-production';
app.use(cookieParser(cookieSecret));

// Sessions
app.use(session({
  secret: cookieSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Session middleware - use cookies for serverless compatibility
app.use((req, res, next) => {
  // Initialize session if needed
  if (!req.session) {
    req.session = {};
  }
  
  // Try to get cart from cookie
  try {
    let cartData = req.signedCookies.cart || req.cookies.cart;
    if (cartData) {
      if (typeof cartData === 'string') {
        cartData = JSON.parse(cartData);
      }
      if (cartData && Array.isArray(cartData.items)) {
        req.session.cart = cartData;
      }
    }
  } catch (e) {
    // Invalid cart cookie, ignore
  }
  
  // Try to get user from cookie
  try {
    let userData = req.signedCookies.user || req.cookies.user;
    if (userData) {
      if (typeof userData === 'string') {
        userData = JSON.parse(userData);
      }
      if (userData && userData.id) {
        req.session.user = userData;
      }
    }
  } catch (e) {
    // Invalid user cookie, ignore
  }
  
  // Ensure cart exists in session
  if (!req.session.cart || !Array.isArray(req.session.cart.items)) {
    req.session.cart = { items: [], subtotal: 0, shipping: 0, total: 0 };
  }
  
  next();
});

// Helper to save session cookies on every response
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  const originalRedirect = res.redirect.bind(res);
  const originalRender = res.render.bind(res);
  
  const cookieOptions = {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
  
  const saveSessionCookies = () => {
    if (req.session) {
      // Save cart cookie
      if (req.session.cart) {
        res.cookie('cart', JSON.stringify(req.session.cart), cookieOptions);
      }
      // Save user cookie
      if (req.session.user) {
        res.cookie('user', JSON.stringify(req.session.user), cookieOptions);
      } else {
        // Clear user cookie if logged out
        res.clearCookie('user', { path: '/' });
      }
    }
  };
  
  res.json = function(data) {
    saveSessionCookies();
    return originalJson(data);
  };
  
  res.redirect = function(...args) {
    saveSessionCookies();
    return originalRedirect(...args);
  };
  
  res.render = function(view, options, callback) {
    saveSessionCookies();
    return originalRender(view, options, callback);
  };
  
  next();
});

// ===========================================
// TEMPLATE ENGINE
// ===========================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===========================================
// STATIC FILES
// ===========================================

// Serve static assets from the original modhu folder
app.use('/assets', express.static(path.join(__dirname, '../modhu/assets'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
// Serve custom CSS from src/public
app.use('/css', express.static(path.join(__dirname, 'public/css')));

// ===========================================
// GLOBAL TEMPLATE VARIABLES
// ===========================================

app.use((req, res, next) => {
  // Make session data available to all templates
  res.locals.user = req.session.user || null;
  res.locals.cart = req.session.cart || { items: [], subtotal: 0, shipping: 0, total: 0 };
  res.locals.cartCount = (res.locals.cart.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
  
  // Store config
  res.locals.store = {
    name: process.env.STORE_NAME || 'El Rincón de la Miel',
    email: process.env.STORE_EMAIL || 'contacto@elrincondelamiel.com',
    currency: process.env.STORE_CURRENCY || 'MXN',
    phone: process.env.STORE_PHONE || '555 123 4567'
  };
  
  // Flash messages
  res.locals.success = req.session.success;
  res.locals.error = req.session.error;
  delete req.session.success;
  delete req.session.error;
  
  // Current path for active nav
  res.locals.currentPath = req.path;
  
  next();
});

// ===========================================
// ROUTES
// ===========================================

app.use('/', indexRoutes);
app.use('/shop', shopRoutes);
app.use('/cart', cartRoutes);
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/v1', apiV1Routes);
app.use('/api/shipping', shippingRoutes);
app.use('/admin', adminRoutes);

// SEO routes at root level
app.get('/sitemap.xml', async (req, res) => {
  try {
    const { generateSitemap } = await import('./services/seo.js');
    const sitemap = await generateSitemap();
    res.set('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    res.status(500).send('Error generating sitemap');
  }
});

app.get('/robots.txt', async (req, res) => {
  try {
    const { generateRobotsTxt } = await import('./services/seo.js');
    res.set('Content-Type', 'text/plain');
    res.send(generateRobotsTxt());
  } catch (error) {
    res.status(500).send('Error generating robots.txt');
  }
});

// ===========================================
// ERROR HANDLING
// ===========================================

// 404 Handler
app.use((req, res) => {
  res.status(404).render('errors/404', {
    title: 'Página no encontrada'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // Handle validation errors
  if (err.type === 'validation') {
    req.session.error = err.message;
    return res.redirect('back');
  }
  
  res.status(err.status || 500).render('errors/500', {
    title: 'Error del servidor',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// ===========================================
// START SERVER (only in non-serverless environments)
// ===========================================

// Check if running in Vercel/serverless
const isVercel = process.env.VERCEL || process.env.NOW_REGION;

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`
🍯 ═══════════════════════════════════════════════════
   MODHU HONEY STORE v3.0
   Servidor corriendo en: http://localhost:${PORT}
   Modo: ${process.env.NODE_ENV || 'development'}
   
   Features:
   ✅ Rate Limiting activo
   ✅ Helmet CSP activo
   ✅ Compression activo
   ✅ Admin CRUD habilitado
🍯 ═══════════════════════════════════════════════════
    `);
  });
}

// Export for Vercel serverless
export default app;
