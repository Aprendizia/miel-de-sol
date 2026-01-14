import express from 'express';
import { supabase, supabaseAdmin, isDemoMode } from '../config/supabase.js';
import { demoDb, categories as demoCategories } from '../data/demo-data.js';

const router = express.Router();

// Home page
router.get('/', async (req, res) => {
  try {
    let featuredProducts, latestProducts, categories;

    if (isDemoMode) {
      // Use demo data
      featuredProducts = demoDb.getProducts({ featured: true, limit: 4 }).data;
      latestProducts = demoDb.getProducts({ limit: 8 }).data;
      categories = demoDb.getCategories();
    } else {
      // Use Supabase
      const { data: featured } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('is_featured', true)
        .limit(4);

      const { data: latest } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(4);

      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      featuredProducts = featured || [];
      latestProducts = latest || [];
      categories = cats || [];
    }

    res.render('pages/home', {
      title: 'Inicio',
      featuredProducts,
      latestProducts,
      categories
    });
  } catch (error) {
    console.error('Error loading home:', error);
    res.render('pages/home', {
      title: 'Inicio',
      featuredProducts: [],
      latestProducts: [],
      categories: []
    });
  }
});

// About page
router.get('/about', (req, res) => {
  res.render('pages/about', {
    title: 'Nosotros'
  });
});

// Services page
router.get('/services', (req, res) => {
  res.render('pages/services', {
    title: 'Servicios'
  });
});

// Contact page
router.get('/contact', (req, res) => {
  res.render('pages/contact', {
    title: 'Contacto'
  });
});

// Learn page - Educational content about bees and honey
router.get('/aprende', (req, res) => {
  res.render('pages/learn', {
    title: 'Aprende sobre las Abejas y la Miel'
  });
});

// Contact form submission
router.post('/contact', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    
    console.log('📧 Contact form submission:', { name, email, phone, message });
    
    req.session.success = '¡Gracias por tu mensaje! Te contactaremos pronto.';
    res.redirect('/contact');
  } catch (error) {
    console.error('Contact form error:', error);
    req.session.error = 'Error al enviar el mensaje. Intenta de nuevo.';
    res.redirect('/contact');
  }
});

// Newsletter subscription
router.post('/newsletter', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (isDemoMode) {
      console.log('📧 Newsletter subscription (demo):', email);
      return res.json({ success: true, message: '¡Gracias por suscribirte!' });
    }

    const { error } = await supabase
      .from('newsletter_subscribers')
      .upsert({ email }, { onConflict: 'email' });

    if (error) throw error;
    
    res.json({ success: true, message: '¡Gracias por suscribirte!' });
  } catch (error) {
    console.error('Newsletter error:', error);
    res.status(500).json({ success: false, message: 'Error al suscribirse' });
  }
});

// Track order page
router.get('/track-order', (req, res) => {
  res.render('pages/track-order', {
    title: 'Seguimiento de Pedido',
    order: null,
    error: null,
    searchEmail: '',
    searchOrder: ''
  });
});

// Track order search
router.post('/track-order', async (req, res) => {
  try {
    const { email, order_number } = req.body;
    
    if (!email && !order_number) {
      return res.render('pages/track-order', {
        title: 'Seguimiento de Pedido',
        order: null,
        error: 'Por favor ingresa tu email o número de pedido',
        searchEmail: email || '',
        searchOrder: order_number || ''
      });
    }

    if (isDemoMode) {
      return res.render('pages/track-order', {
        title: 'Seguimiento de Pedido',
        order: null,
        error: 'Función no disponible en modo demo',
        searchEmail: email || '',
        searchOrder: order_number || ''
      });
    }

    let query = supabaseAdmin
      .from('orders')
      .select('*, order_items(*)');

    if (order_number) {
      query = query.eq('order_number', order_number);
    } else if (email) {
      query = query.eq('customer_email', email).order('created_at', { ascending: false }).limit(1);
    }

    const { data: orders, error } = await query;

    if (error) throw error;

    const order = orders && orders.length > 0 ? orders[0] : null;

    if (!order) {
      return res.render('pages/track-order', {
        title: 'Seguimiento de Pedido',
        order: null,
        error: 'No se encontró ningún pedido con esos datos',
        searchEmail: email || '',
        searchOrder: order_number || ''
      });
    }

    res.render('pages/track-order', {
      title: `Pedido #${order.order_number}`,
      order,
      error: null,
      searchEmail: '',
      searchOrder: ''
    });
  } catch (error) {
    console.error('Track order error:', error);
    res.render('pages/track-order', {
      title: 'Seguimiento de Pedido',
      order: null,
      error: 'Error al buscar el pedido',
      searchEmail: req.body.email || '',
      searchOrder: req.body.order_number || ''
    });
  }
});

export default router;
