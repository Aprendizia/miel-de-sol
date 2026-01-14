import express from 'express';
import { supabase, supabaseAdmin, isDemoMode } from '../config/supabase.js';
import { validateLogin, validateRegister, authLimiter } from '../middleware/security.js';

const router = express.Router();

// Login page
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  
  res.render('pages/auth/login', {
    title: 'Iniciar Sesión'
  });
});

// Login process
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (isDemoMode) {
      // Demo login - accept any credentials
      req.session.user = {
        id: 'demo-user',
        email: email,
        full_name: 'Usuario Demo',
        role: email.includes('admin') ? 'admin' : 'customer'
      };
      req.session.success = '¡Bienvenido! (Modo Demo)';
      return res.redirect('/');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      req.session.error = 'Credenciales inválidas';
      return res.redirect('/auth/login');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    req.session.user = {
      id: data.user.id,
      email: data.user.email,
      ...profile
    };

    req.session.success = '¡Bienvenido de nuevo!';
    
    const redirectTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(redirectTo);
  } catch (error) {
    console.error('Login error:', error);
    req.session.error = 'Error al iniciar sesión';
    res.redirect('/auth/login');
  }
});

// Register page
router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  
  res.render('pages/auth/register', {
    title: 'Crear Cuenta'
  });
});

// Register process
router.post('/register', authLimiter, validateRegister, async (req, res) => {
  try {
    const { full_name, email, password, phone } = req.body;

    if (isDemoMode) {
      // Demo registration
      req.session.success = '¡Cuenta creada! (Modo Demo) - Inicia sesión con cualquier credencial';
      return res.redirect('/auth/login');
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name }
      }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        req.session.error = 'Este correo ya está registrado';
      } else {
        req.session.error = 'Error al crear la cuenta';
      }
      return res.redirect('/auth/register');
    }

    await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        full_name,
        phone,
        role: 'customer'
      });

    req.session.success = '¡Cuenta creada! Por favor inicia sesión.';
    res.redirect('/auth/login');
  } catch (error) {
    console.error('Register error:', error);
    req.session.error = 'Error al crear la cuenta';
    res.redirect('/auth/register');
  }
});

// Logout
router.get('/logout', (req, res) => {
  // Clear user from session
  req.session.user = null;
  delete req.session.user;
  
  // Clear user cookie
  res.clearCookie('user', { path: '/' });
  
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/');
  });
});

// Profile page
router.get('/profile', requireAuth, async (req, res) => {
  try {
    let orders = [];
    let addresses = [];

    if (!isDemoMode && req.session.user.id !== 'demo-user') {
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', req.session.user.id)
        .order('created_at', { ascending: false });

      const { data: addressesData } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', req.session.user.id);

      orders = ordersData || [];
      addresses = addressesData || [];
    }

    res.render('pages/auth/profile', {
      title: 'Mi Perfil',
      orders,
      addresses
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.render('pages/auth/profile', {
      title: 'Mi Perfil',
      orders: [],
      addresses: []
    });
  }
});

// Update profile
router.post('/profile', requireAuth, async (req, res) => {
  try {
    const { full_name, phone } = req.body;

    if (!isDemoMode && req.session.user.id !== 'demo-user') {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name, phone })
        .eq('id', req.session.user.id);

      if (error) throw error;
    }

    req.session.user.full_name = full_name;
    req.session.user.phone = phone;
    req.session.success = 'Perfil actualizado';
    res.redirect('/auth/profile');
  } catch (error) {
    console.error('Update profile error:', error);
    req.session.error = 'Error al actualizar el perfil';
    res.redirect('/auth/profile');
  }
});

// Forgot password page
router.get('/forgot-password', (req, res) => {
  res.render('pages/auth/forgot-password', {
    title: 'Recuperar Contraseña'
  });
});

// Send password reset email
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (isDemoMode) {
      req.session.success = 'Si el correo existe, recibirás instrucciones (Modo Demo - no se envían emails).';
      return res.redirect('/auth/forgot-password');
    }

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${req.protocol}://${req.get('host')}/auth/reset-password`
    });

    req.session.success = 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña.';
    res.redirect('/auth/forgot-password');
  } catch (error) {
    console.error('Forgot password error:', error);
    req.session.error = 'Error al procesar la solicitud';
    res.redirect('/auth/forgot-password');
  }
});

// Orders page
router.get('/orders', requireAuth, async (req, res) => {
  try {
    let orders = [];

    if (!isDemoMode && req.session.user.id !== 'demo-user') {
      const userEmail = req.session.user.email;
      const userId = req.session.user.id;
      
      console.log('🔍 Searching orders for:', { userId, userEmail });
      
      // Use supabaseAdmin to bypass RLS (same as track-order)
      const { data: ordersData, error } = await supabaseAdmin
        .from('orders')
        .select('*, order_items(*)')
        .eq('customer_email', userEmail)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Orders query error:', error);
      } else {
        console.log('📦 Found orders:', ordersData?.length || 0);
      }

      orders = ordersData || [];
    }

    res.render('pages/auth/orders', {
      title: 'Mis Pedidos',
      orders
    });
  } catch (error) {
    console.error('Orders error:', error);
    res.render('pages/auth/orders', {
      title: 'Mis Pedidos',
      orders: []
    });
  }
});

// Middleware to require authentication
function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    req.session.error = 'Debes iniciar sesión para continuar';
    return res.redirect('/auth/login');
  }
  next();
}

// Middleware to require admin role
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    req.session.error = 'No tienes permiso para acceder a esta página';
    return res.redirect('/');
  }
  next();
}

export { requireAuth, requireAdmin };
export default router;
