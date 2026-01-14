/**
 * API v1 Routes
 * RESTful API for integrations (n8n, respond.io, etc.)
 */
import express from 'express';
import { supabaseAdmin, isDemoMode } from '../config/supabase.js';
import { apiAuth, requirePermission, generateApiKey, hashApiKey } from '../middleware/api-auth.js';
import * as webhooksService from '../services/webhooks.js';
import * as promotionsService from '../services/promotions.js';
import * as inventoryService from '../services/inventory.js';
import * as reportsService from '../services/reports.js';
import * as couponsService from '../services/coupons.js';
import { products as demoProducts, categories as demoCategories } from '../data/demo-data.js';

const router = express.Router();

// ==========================================
// API INFO
// ==========================================

router.get('/', (req, res) => {
  res.json({
    name: 'Modhu Honey Store API',
    version: '1.0.0',
    documentation: '/api/v1/docs',
    endpoints: {
      products: '/api/v1/products',
      orders: '/api/v1/orders',
      customers: '/api/v1/customers',
      inventory: '/api/v1/inventory',
      promotions: '/api/v1/promotions',
      webhooks: '/api/v1/webhooks',
      analytics: '/api/v1/analytics'
    }
  });
});

// ==========================================
// PRODUCTS
// ==========================================

router.get('/products', apiAuth, requirePermission('read:products'), async (req, res) => {
  try {
    const { category, search, active, featured, limit = 50, offset = 0 } = req.query;
    
    if (isDemoMode) {
      let products = [...demoProducts];
      if (search) {
        products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
      }
      if (active !== undefined) {
        products = products.filter(p => p.is_active === (active === 'true'));
      }
      return res.json({
        success: true,
        data: products.slice(parseInt(offset), parseInt(offset) + parseInt(limit)),
        pagination: { total: products.length, limit: parseInt(limit), offset: parseInt(offset) }
      });
    }
    
    let query = supabaseAdmin
      .from('products')
      .select('*, categories(id, name, slug)', { count: 'exact' });
    
    if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    if (category) query = query.eq('category_id', category);
    if (active !== undefined) query = query.eq('is_active', active === 'true');
    if (featured === 'true') query = query.eq('is_featured', true);
    
    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    const { data, error, count } = await query;
    if (error) throw error;
    
    res.json({
      success: true,
      data,
      pagination: { total: count, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/products/:id', apiAuth, requirePermission('read:products'), async (req, res) => {
  try {
    const { id } = req.params;
    
    if (isDemoMode) {
      const product = demoProducts.find(p => p.id === id || p.slug === id);
      if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
      return res.json({ success: true, data: product });
    }
    
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*, categories(*)')
      .or(`id.eq.${id},slug.eq.${id}`)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/products', apiAuth, requirePermission('write:products'), async (req, res) => {
  try {
    if (isDemoMode) {
      return res.json({ success: true, message: '(Demo) Product created', data: { id: 'demo-new' } });
    }
    
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert(req.body)
      .select()
      .single();
    
    if (error) throw error;
    
    await webhooksService.trigger('product.created', data);
    
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/products/:id', apiAuth, requirePermission('write:products'), async (req, res) => {
  try {
    if (isDemoMode) {
      return res.json({ success: true, message: '(Demo) Product updated' });
    }
    
    const { error } = await supabaseAdmin
      .from('products')
      .update(req.body)
      .eq('id', req.params.id);
    
    if (error) throw error;
    
    await webhooksService.trigger('product.updated', { id: req.params.id, ...req.body });
    
    res.json({ success: true, message: 'Product updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/products/:id', apiAuth, requirePermission('write:products'), async (req, res) => {
  try {
    if (isDemoMode) {
      return res.json({ success: true, message: '(Demo) Product deleted' });
    }
    
    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', req.params.id);
    
    if (error) throw error;
    
    await webhooksService.trigger('product.deleted', { id: req.params.id });
    
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/products/:id/stock', apiAuth, requirePermission('write:inventory'), async (req, res) => {
  try {
    const { quantity, type = 'adjustment', notes = '' } = req.body;
    
    const result = await inventoryService.adjustStock(req.params.id, parseInt(quantity), {
      type,
      notes,
      referenceType: 'api'
    });
    
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ORDERS
// ==========================================

router.get('/orders', apiAuth, requirePermission('read:orders'), async (req, res) => {
  try {
    const { status, payment_status, from_date, to_date, limit = 50, offset = 0 } = req.query;
    
    if (isDemoMode) {
      const orders = [
        { id: '1', order_number: 'DEMO001', customer_name: 'María García', total: 580, status: 'pending' },
        { id: '2', order_number: 'DEMO002', customer_name: 'Juan Pérez', total: 750, status: 'shipped' }
      ];
      return res.json({ success: true, data: orders, pagination: { total: 2 } });
    }
    
    let query = supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    
    if (status) query = query.eq('status', status);
    if (payment_status) query = query.eq('payment_status', payment_status);
    if (from_date) query = query.gte('created_at', from_date);
    if (to_date) query = query.lte('created_at', to_date);
    
    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    const { data, error, count } = await query;
    if (error) throw error;
    
    res.json({
      success: true,
      data,
      pagination: { total: count, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/orders/:id', apiAuth, requirePermission('read:orders'), async (req, res) => {
  try {
    if (isDemoMode) {
      return res.json({
        success: true,
        data: {
          id: req.params.id,
          order_number: 'DEMO001',
          items: [{ product_name: 'Miel Premium', quantity: 2, unit_price: 265 }]
        }
      });
    }
    
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .or(`id.eq.${req.params.id},order_number.eq.${req.params.id}`)
      .single();
    
    if (error || !order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('order_id', order.id);
    
    res.json({ success: true, data: { ...order, items } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/orders/:id/status', apiAuth, requirePermission('write:orders'), async (req, res) => {
  try {
    const { status, tracking_number, tracking_url } = req.body;
    
    if (isDemoMode) {
      return res.json({ success: true, message: '(Demo) Order updated' });
    }
    
    const updateData = {};
    if (status) {
      updateData.status = status;
      if (status === 'shipped') updateData.shipped_at = new Date().toISOString();
      if (status === 'delivered') updateData.delivered_at = new Date().toISOString();
    }
    if (tracking_number) updateData.tracking_number = tracking_number;
    if (tracking_url) updateData.tracking_url = tracking_url;
    
    const { error } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', req.params.id);
    
    if (error) throw error;
    
    if (status) {
      await webhooksService.trigger(`order.${status}`, { order_id: req.params.id, ...updateData });
    }
    
    res.json({ success: true, message: 'Order updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/orders/:id/tracking', apiAuth, requirePermission('write:orders'), async (req, res) => {
  try {
    const { tracking_number, tracking_url, carrier } = req.body;
    
    if (isDemoMode) {
      return res.json({ success: true, message: '(Demo) Tracking added' });
    }
    
    const { error } = await supabaseAdmin
      .from('orders')
      .update({
        tracking_number,
        tracking_url,
        shipping_carrier: carrier,
        status: 'shipped',
        shipped_at: new Date().toISOString()
      })
      .eq('id', req.params.id);
    
    if (error) throw error;
    
    await webhooksService.trigger('order.shipped', {
      order_id: req.params.id,
      tracking_number,
      tracking_url,
      carrier
    });
    
    res.json({ success: true, message: 'Tracking added' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// CUSTOMERS
// ==========================================

router.get('/customers', apiAuth, requirePermission('read:customers'), async (req, res) => {
  try {
    const { search, role, limit = 50, offset = 0 } = req.query;
    
    if (isDemoMode) {
      return res.json({
        success: true,
        data: [
          { id: '1', email: 'maria@email.com', full_name: 'María García', total_orders: 5, total_spent: 2450 },
          { id: '2', email: 'juan@email.com', full_name: 'Juan Pérez', total_orders: 3, total_spent: 1580 }
        ],
        pagination: { total: 2 }
      });
    }
    
    let query = supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });
    
    if (search) query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    if (role) query = query.eq('role', role);
    
    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    
    const { data, error, count } = await query;
    if (error) throw error;
    
    res.json({
      success: true,
      data,
      pagination: { total: count, limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/customers/:id', apiAuth, requirePermission('read:customers'), async (req, res) => {
  try {
    if (isDemoMode) {
      return res.json({
        success: true,
        data: {
          id: req.params.id,
          email: 'demo@example.com',
          full_name: 'Demo User',
          orders: []
        }
      });
    }
    
    const { data: customer, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error || !customer) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, total, status, created_at')
      .eq('user_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(10);
    
    res.json({ success: true, data: { ...customer, recent_orders: orders } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// INVENTORY
// ==========================================

router.get('/inventory', apiAuth, requirePermission('read:inventory'), async (req, res) => {
  try {
    const summary = await inventoryService.getInventorySummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/inventory/movements', apiAuth, requirePermission('read:inventory'), async (req, res) => {
  try {
    const { product_id, type, limit, offset } = req.query;
    const result = await inventoryService.getInventoryMovements({
      product_id,
      type,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/inventory/adjust', apiAuth, requirePermission('write:inventory'), async (req, res) => {
  try {
    const { adjustments } = req.body;
    
    if (!adjustments || !Array.isArray(adjustments)) {
      return res.status(400).json({ success: false, error: 'adjustments array required' });
    }
    
    const results = await inventoryService.bulkAdjustStock(adjustments);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/inventory/alerts', apiAuth, requirePermission('read:inventory'), async (req, res) => {
  try {
    const [lowStock, outOfStock, projection] = await Promise.all([
      inventoryService.getLowStockProducts(),
      inventoryService.getOutOfStockProducts(),
      inventoryService.getStockProjection(7)
    ]);
    
    res.json({
      success: true,
      data: {
        low_stock: lowStock,
        out_of_stock: outOfStock,
        stockout_risk_7days: projection
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// PROMOTIONS
// ==========================================

router.get('/promotions', apiAuth, requirePermission('read:promotions'), async (req, res) => {
  try {
    const { active, type } = req.query;
    const result = await promotionsService.getPromotions({
      active: active !== undefined ? active === 'true' : undefined,
      type
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/promotions/active', apiAuth, requirePermission('read:promotions'), async (req, res) => {
  try {
    const promotions = await promotionsService.getActivePromotions();
    res.json({ success: true, data: promotions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/promotions', apiAuth, requirePermission('write:promotions'), async (req, res) => {
  try {
    const result = await promotionsService.createPromotion(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/promotions/:id', apiAuth, requirePermission('write:promotions'), async (req, res) => {
  try {
    const result = await promotionsService.updatePromotion(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/promotions/:id', apiAuth, requirePermission('write:promotions'), async (req, res) => {
  try {
    const result = await promotionsService.deletePromotion(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// COUPONS
// ==========================================

router.get('/coupons', apiAuth, requirePermission('read:coupons'), async (req, res) => {
  try {
    const { active } = req.query;
    const result = await couponsService.getCoupons({
      active: active !== undefined ? active === 'true' : undefined
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/coupons/validate', apiAuth, requirePermission('read:coupons'), async (req, res) => {
  try {
    const { code, user_id, subtotal } = req.body;
    const result = await couponsService.validateCoupon(code, user_id, subtotal);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ANALYTICS
// ==========================================

router.get('/analytics/sales', apiAuth, requirePermission('read:analytics'), async (req, res) => {
  try {
    const { period = 30 } = req.query;
    const stats = await reportsService.getSalesStats(parseInt(period));
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics/products', apiAuth, requirePermission('read:analytics'), async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const topProducts = await reportsService.getTopProducts(parseInt(limit));
    res.json({ success: true, data: topProducts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics/customers', apiAuth, requirePermission('read:analytics'), async (req, res) => {
  try {
    const stats = await reportsService.getCustomerStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics/revenue', apiAuth, requirePermission('read:analytics'), async (req, res) => {
  try {
    const summary = await reportsService.getRevenueSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// WEBHOOKS MANAGEMENT
// ==========================================

router.get('/webhooks', apiAuth, requirePermission('read:webhooks'), async (req, res) => {
  try {
    const webhooks = await webhooksService.getWebhooks();
    res.json({ success: true, data: webhooks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/webhooks/events', apiAuth, requirePermission('read:webhooks'), (req, res) => {
  res.json({ success: true, data: webhooksService.WEBHOOK_EVENTS });
});

router.post('/webhooks', apiAuth, requirePermission('write:webhooks'), async (req, res) => {
  try {
    const result = await webhooksService.createWebhook(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/webhooks/:id', apiAuth, requirePermission('write:webhooks'), async (req, res) => {
  try {
    const result = await webhooksService.updateWebhook(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/webhooks/:id', apiAuth, requirePermission('write:webhooks'), async (req, res) => {
  try {
    const result = await webhooksService.deleteWebhook(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/webhooks/:id/test', apiAuth, requirePermission('write:webhooks'), async (req, res) => {
  try {
    const result = await webhooksService.testWebhook(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/webhooks/:id/logs', apiAuth, requirePermission('read:webhooks'), async (req, res) => {
  try {
    const logs = await webhooksService.getWebhookLogs(req.params.id, parseInt(req.query.limit) || 50);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// n8n SPECIFIC ENDPOINTS
// ==========================================

router.get('/n8n/abandoned-carts', apiAuth, requirePermission('read:carts'), async (req, res) => {
  try {
    if (isDemoMode) {
      return res.json({
        success: true,
        data: [
          {
            id: 'cart-1',
            email: 'maria@email.com',
            name: 'María García',
            cart_total: 580,
            items_count: 3,
            abandoned_at: new Date(Date.now() - 86400000)
          }
        ]
      });
    }
    
    const { data } = await supabaseAdmin
      .from('abandoned_carts')
      .select('*, profiles(email, full_name)')
      .eq('recovered', false)
      .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order('cart_total', { ascending: false });
    
    res.json({
      success: true,
      data: (data || []).map(cart => ({
        id: cart.id,
        email: cart.email,
        name: cart.profiles?.full_name,
        cart_total: cart.cart_total,
        cart_data: cart.cart_data,
        reminder_sent: cart.reminder_sent,
        created_at: cart.created_at
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/n8n/orders-for-shipping', apiAuth, requirePermission('read:orders'), async (req, res) => {
  try {
    if (isDemoMode) {
      return res.json({
        success: true,
        data: [
          {
            id: 'order-1',
            order_number: 'DEMO001',
            customer_name: 'María García',
            shipping_address: { city: 'CDMX', state: 'CDMX' }
          }
        ]
      });
    }
    
    const { data } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('payment_status', 'paid')
      .in('status', ['confirmed', 'processing'])
      .is('tracking_number', null)
      .order('created_at');
    
    res.json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/n8n/daily-summary', apiAuth, requirePermission('read:analytics'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [revenue, inventory] = await Promise.all([
      reportsService.getRevenueSummary(),
      inventoryService.getInventorySummary()
    ]);
    
    res.json({
      success: true,
      data: {
        date: today.toISOString().split('T')[0],
        revenue: revenue.today,
        orders_count: revenue.ordersToday || 0,
        low_stock_count: inventory.low_stock,
        out_of_stock_count: inventory.out_of_stock
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// respond.io SPECIFIC ENDPOINTS
// ==========================================

router.post('/respond/customer-lookup', apiAuth, requirePermission('read:customers'), async (req, res) => {
  try {
    const { phone, email } = req.body;
    
    if (!phone && !email) {
      return res.status(400).json({ success: false, error: 'phone or email required' });
    }
    
    if (isDemoMode) {
      return res.json({
        success: true,
        found: true,
        customer: {
          id: 'demo-1',
          name: 'María García',
          email: 'maria@email.com',
          total_orders: 5,
          total_spent: 2450,
          loyalty_tier: 'gold'
        }
      });
    }
    
    let query = supabaseAdmin.from('profiles').select('*');
    if (phone) query = query.eq('phone', phone);
    else query = query.eq('email', email);
    
    const { data: customer } = await query.single();
    
    if (!customer) {
      return res.json({
        success: true,
        found: false,
        message: 'Cliente nuevo',
        suggested_actions: ['register', 'browse_catalog']
      });
    }
    
    const loyaltyTier = customer.total_spent >= 5000 ? 'platinum' :
                        customer.total_spent >= 2000 ? 'gold' :
                        customer.total_spent >= 500 ? 'silver' : 'bronze';
    
    res.json({
      success: true,
      found: true,
      customer: {
        id: customer.id,
        name: customer.full_name,
        email: customer.email,
        phone: customer.phone,
        total_orders: customer.total_orders,
        total_spent: customer.total_spent,
        loyalty_tier: loyaltyTier
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/respond/order-status/:orderNumber', apiAuth, requirePermission('read:orders'), async (req, res) => {
  try {
    const { orderNumber } = req.params;
    
    if (isDemoMode) {
      return res.json({
        success: true,
        found: true,
        order_number: orderNumber,
        status: 'shipped',
        message: '🚚 ¡En camino! Rastreo: MX123456789',
        tracking_url: 'https://rastreo.example.com/MX123456789'
      });
    }
    
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('order_number, status, payment_status, tracking_number, tracking_url')
      .eq('order_number', orderNumber)
      .single();
    
    if (!order) {
      return res.json({ success: true, found: false });
    }
    
    const statusMessages = {
      pending: '⏳ Tu pedido está pendiente de pago',
      confirmed: '✅ Pedido confirmado, lo estamos preparando',
      processing: '📦 Empacando tu pedido con mucho cariño',
      shipped: `🚚 ¡En camino! ${order.tracking_number ? `Rastreo: ${order.tracking_number}` : ''}`,
      delivered: '✨ ¡Entregado! Gracias por tu compra',
      cancelled: '❌ Pedido cancelado'
    };
    
    res.json({
      success: true,
      found: true,
      order_number: order.order_number,
      status: order.status,
      payment_status: order.payment_status,
      message: statusMessages[order.status] || order.status,
      tracking_number: order.tracking_number,
      tracking_url: order.tracking_url
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/respond/product-info/:slug', apiAuth, requirePermission('read:products'), async (req, res) => {
  try {
    const { slug } = req.params;
    
    if (isDemoMode) {
      return res.json({
        success: true,
        data: {
          name: 'Miel de Bosque Premium',
          price: '$265 MXN',
          stock: 'Disponible',
          description: 'Miel 100% pura de bosque mexicano',
          link: '/shop/product/miel-bosque'
        }
      });
    }
    
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name, price, sale_price, stock_quantity, short_description, slug')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();
    
    if (!product) {
      return res.json({ success: true, found: false });
    }
    
    const finalPrice = product.sale_price || product.price;
    const stockStatus = product.stock_quantity > 10 ? 'Disponible' :
                       product.stock_quantity > 0 ? `Últimas ${product.stock_quantity} unidades` :
                       'Agotado';
    
    res.json({
      success: true,
      found: true,
      data: {
        name: product.name,
        price: `$${finalPrice} MXN`,
        original_price: product.sale_price ? `$${product.price} MXN` : null,
        stock: stockStatus,
        description: product.short_description,
        link: `/shop/product/${product.slug}`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// API KEYS MANAGEMENT
// ==========================================

router.get('/keys', apiAuth, requirePermission('admin:keys'), async (req, res) => {
  try {
    if (isDemoMode) {
      return res.json({
        success: true,
        data: [
          { id: '1', name: 'n8n-automation', prefix: 'modhu_nw', permissions: ['read:*'], last_used_at: new Date() },
          { id: '2', name: 'respond-bot', prefix: 'modhu_rs', permissions: ['read:orders'], last_used_at: new Date() }
        ]
      });
    }
    
    const { data } = await supabaseAdmin
      .from('api_keys')
      .select('id, name, prefix, permissions, rate_limit, is_active, last_used_at, expires_at, created_at')
      .order('created_at', { ascending: false });
    
    res.json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/keys', apiAuth, requirePermission('admin:keys'), async (req, res) => {
  try {
    const { name, permissions = [], rate_limit = 100, expires_at } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'name required' });
    }
    
    const { key, prefix, keyHash } = generateApiKey();
    
    if (isDemoMode) {
      return res.json({
        success: true,
        data: { name, prefix },
        key, // Only shown once!
        message: 'Save this key securely, it will not be shown again'
      });
    }
    
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .insert({
        name,
        prefix,
        key_hash: keyHash,
        permissions,
        rate_limit,
        expires_at
      })
      .select('id, name, prefix')
      .single();
    
    if (error) throw error;
    
    res.status(201).json({
      success: true,
      data,
      key, // Only shown once!
      message: 'Save this key securely, it will not be shown again'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/keys/:id', apiAuth, requirePermission('admin:keys'), async (req, res) => {
  try {
    if (isDemoMode) {
      return res.json({ success: true, message: '(Demo) API key deleted' });
    }
    
    const { error } = await supabaseAdmin
      .from('api_keys')
      .delete()
      .eq('id', req.params.id);
    
    if (error) throw error;
    res.json({ success: true, message: 'API key deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
