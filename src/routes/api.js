import express from 'express';
import { supabase, supabaseAdmin, isDemoMode } from '../config/supabase.js';
import { demoDb, products as demoProducts } from '../data/demo-data.js';
import { isStripeConfigured, constructWebhookEvent } from '../services/stripe.js';
import { validateSearch } from '../middleware/security.js';

const router = express.Router();

// ===========================================
// STRIPE WEBHOOKS
// ===========================================

router.post('/webhooks/stripe', async (req, res) => {
  if (!isStripeConfigured) {
    return res.status(400).json({ error: 'Stripe not configured' });
  }

  const sig = req.headers['stripe-signature'];
  
  if (!sig) {
    console.error('❌ No stripe-signature header');
    return res.status(400).json({ error: 'No signature' });
  }

  let event;

  try {
    event = constructWebhookEvent(req.body, sig);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  console.log(`📨 Stripe webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orderId = session.client_reference_id;
        
        console.log(`✅ Payment completed for order: ${orderId}`);
        
        if (!isDemoMode && orderId && !orderId.startsWith('demo')) {
          // Update order status
          const { error: updateError } = await supabaseAdmin
            .from('orders')
            .update({
              payment_status: 'paid',
              status: 'confirmed',
              payment_id: session.payment_intent || session.id,
              payment_method: 'stripe'
            })
            .eq('id', orderId);

          if (updateError) {
            console.error('❌ Error updating order:', updateError);
          } else {
            console.log(`✅ Order ${orderId} updated to paid/confirmed`);
            
            // Decrement stock for order items
            await decrementStockForOrder(orderId);
          }
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const orderId = session.client_reference_id;
        
        console.log(`⏰ Checkout session expired for order: ${orderId}`);
        
        if (!isDemoMode && orderId && !orderId.startsWith('demo')) {
          await supabaseAdmin
            .from('orders')
            .update({
              payment_status: 'failed',
              status: 'cancelled'
            })
            .eq('id', orderId);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        console.log(`❌ Payment failed: ${paymentIntent.id}`);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        console.log(`↩️ Charge refunded: ${charge.id}`);
        
        // Find order by payment_id and update
        if (!isDemoMode) {
          await supabaseAdmin
            .from('orders')
            .update({
              payment_status: 'refunded',
              status: 'refunded'
            })
            .eq('payment_id', charge.payment_intent);
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Helper function to decrement stock after successful payment
async function decrementStockForOrder(orderId) {
  try {
    // Get order items
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', orderId);

    if (itemsError) {
      console.error('Error fetching order items:', itemsError);
      return;
    }

    // Decrement stock for each item
    for (const item of orderItems) {
      if (item.product_id) {
        const { error: stockError } = await supabaseAdmin.rpc('decrement_stock', {
          p_product_id: item.product_id,
          p_quantity: item.quantity
        });

        if (stockError) {
          // Fallback: manual decrement
          const { data: product } = await supabaseAdmin
            .from('products')
            .select('stock_quantity')
            .eq('id', item.product_id)
            .single();

          if (product) {
            await supabaseAdmin
              .from('products')
              .update({ stock_quantity: Math.max(0, product.stock_quantity - item.quantity) })
              .eq('id', item.product_id);
          }
        }
      }
    }

    console.log(`📦 Stock decremented for order ${orderId}`);
  } catch (error) {
    console.error('Error decrementing stock:', error);
  }
}

// ===========================================
// PRODUCTS API
// ===========================================

// Get all products
router.get('/products', async (req, res) => {
  try {
    const { category, featured, search, limit = 20, offset = 0 } = req.query;

    if (isDemoMode) {
      let products = [...demoProducts];
      
      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        products = products.filter(p => 
          p.name.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower)
        );
      }
      
      const result = demoDb.getProducts({
        category,
        featured: featured === 'true',
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return res.json({
        success: true,
        data: search ? products.slice(parseInt(offset), parseInt(offset) + parseInt(limit)) : result.data,
        pagination: {
          total: search ? products.length : result.count,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    }

    let query = supabase
      .from('products')
      .select('*, categories(name, slug)', { count: 'exact' })
      .eq('is_active', true);

    // Search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,short_description.ilike.%${search}%`);
    }

    if (category) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', category)
        .single();
      if (cat) query = query.eq('category_id', cat.id);
    }

    if (featured === 'true') {
      query = query.eq('is_featured', true);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('API products error:', error);
    res.status(500).json({ success: false, message: 'Error fetching products' });
  }
});

// Get single product
router.get('/products/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    if (isDemoMode) {
      const product = demoDb.getProductBySlug(slug);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }
      return res.json({ success: true, data: product });
    }

    const { data, error } = await supabase
      .from('products')
      .select('*, categories(name, slug)')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('API product error:', error);
    res.status(500).json({ success: false, message: 'Error fetching product' });
  }
});

// ===========================================
// CATEGORIES API
// ===========================================

router.get('/categories', async (req, res) => {
  try {
    if (isDemoMode) {
      return res.json({ success: true, data: demoDb.getCategories() });
    }

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    console.error('API categories error:', error);
    res.status(500).json({ success: false, message: 'Error fetching categories' });
  }
});

// ===========================================
// SEARCH API
// ===========================================

router.get('/search', validateSearch, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    if (isDemoMode) {
      const searchLower = q.toLowerCase();
      const results = demoProducts
        .filter(p => 
          p.name.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower) ||
          p.short_description?.toLowerCase().includes(searchLower)
        )
        .slice(0, parseInt(limit))
        .map(p => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          sale_price: p.sale_price,
          image_url: p.image_url,
          category: p.categories?.name
        }));

      return res.json({ success: true, data: results, query: q });
    }

    const { data, error } = await supabase
      .from('products')
      .select('id, name, slug, price, sale_price, image_url, categories(name)')
      .eq('is_active', true)
      .or(`name.ilike.%${q}%,description.ilike.%${q}%,short_description.ilike.%${q}%`)
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({ 
      success: true, 
      data: data.map(p => ({ ...p, category: p.categories?.name })),
      query: q 
    });
  } catch (error) {
    console.error('API search error:', error);
    res.status(500).json({ success: false, message: 'Error searching' });
  }
});

// ===========================================
// TRACK ORDER
// ===========================================

router.get('/track/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email requerido' });
    }

    if (isDemoMode) {
      return res.json({
        success: true,
        data: {
          order_number: orderNumber,
          status: 'shipped',
          tracking_number: 'MX123456789',
          tracking_url: 'https://ejemplo.com/rastreo/MX123456789'
        }
      });
    }

    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('order_number, status, payment_status, tracking_number, tracking_url, created_at, shipped_at, delivered_at')
      .eq('order_number', orderNumber)
      .eq('customer_email', email)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('API track error:', error);
    res.status(500).json({ success: false, message: 'Error buscando pedido' });
  }
});

// ===========================================
// SEO ENDPOINTS
// ===========================================

import * as seoService from '../services/seo.js';

router.get('/sitemap.xml', async (req, res) => {
  try {
    const sitemap = await seoService.generateSitemap();
    res.set('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Sitemap error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

router.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(seoService.generateRobotsTxt());
});

// ===========================================
// HEALTH CHECK
// ===========================================

router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    version: '2.0.0',
    mode: isDemoMode ? 'demo' : 'production',
    features: {
      supabase: !isDemoMode,
      stripe: isStripeConfigured,
      search: true,
      admin: true
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ===========================================
// STATUS CHECK (for debugging)
// ===========================================

router.get('/status', (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.APP_URL;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  res.json({
    success: true,
    environment: process.env.NODE_ENV || 'development',
    supabase: {
      configured: !isDemoMode,
      mode: isDemoMode ? 'demo' : 'production'
    },
    stripe: {
      configured: isStripeConfigured,
      keyExists: !!stripeKey,
      keyPrefix: stripeKey ? stripeKey.substring(0, 7) + '...' : 'not set',
      webhookConfigured: !!webhookSecret
    },
    app: {
      url: appUrl || 'not set'
    },
    security: {
      rateLimiting: true,
      csp: true,
      compression: true
    },
    timestamp: new Date().toISOString()
  });
});

export { decrementStockForOrder };
export default router;
