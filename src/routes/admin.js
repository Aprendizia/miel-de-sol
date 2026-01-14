import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin, isDemoMode } from '../config/supabase.js';
import { requireAuth, requireAdmin } from './auth.js';
import { products as demoProducts, categories as demoCategories, demoDb } from '../data/demo-data.js';
import { isGeminiConfigured, generateImage, listPrompts } from '../services/imageGenerator.js';
import { adminLimiter, validateProduct, validateOrderUpdate } from '../middleware/security.js';

// Import services
import * as couponsService from '../services/coupons.js';
import * as reportsService from '../services/reports.js';
import * as shippingService from '../services/shipping.js';
import * as usersService from '../services/users.js';
import * as seoService from '../services/seo.js';
import * as promotionsService from '../services/promotions.js';
import * as inventoryService from '../services/inventory.js';
import * as webhooksService from '../services/webhooks.js';
import * as imageUploadService from '../services/imageUpload.js';
import * as enviaService from '../services/envia.js';
import * as emailService from '../services/email.js';
import { generateApiKey, hashApiKey } from '../middleware/api-auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for MEMORY storage (works with Vercel serverless)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Solo se permiten imágenes (JPG, PNG, GIF, WebP)'));
  }
});

// Apply auth middleware
router.use(requireAuth);
router.use(requireAdmin);
router.use(adminLimiter);

// Helper: Generate slug
function generateSlug(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ===========================================
// DASHBOARD
// ===========================================

router.get('/', async (req, res) => {
  try {
    const [stats, salesStats, topProducts, ordersByStatus, revenueSummary] = await Promise.all([
      getBasicStats(),
      reportsService.getSalesStats(30),
      reportsService.getTopProducts(5),
      reportsService.getOrdersByStatus(),
      reportsService.getRevenueSummary()
    ]);

    let recentOrders = [];
    let lowStockProducts = [];

    if (isDemoMode) {
      recentOrders = [
        { id: '1', order_number: 'DEMO001', customer_name: 'María García', total: 580, status: 'pending', payment_status: 'pending', created_at: new Date() },
        { id: '2', order_number: 'DEMO002', customer_name: 'Juan Pérez', total: 750, status: 'shipped', payment_status: 'paid', created_at: new Date(Date.now() - 86400000) }
      ];
      lowStockProducts = demoProducts.filter(p => p.stock_quantity < 20).slice(0, 5);
    } else {
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      recentOrders = orders || [];

      const { data: lowStock } = await supabaseAdmin
        .from('products')
        .select('*')
        .lt('stock_quantity', 20)
        .eq('is_active', true)
        .order('stock_quantity')
        .limit(5);
      lowStockProducts = lowStock || [];
    }

    res.render('admin/dashboard', {
      title: 'Dashboard',
      stats,
      salesStats: JSON.stringify(salesStats),
      topProducts,
      ordersByStatus,
      revenueSummary,
      recentOrders,
      lowStockProducts,
      isDemoMode
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('admin/dashboard', {
      title: 'Dashboard',
      stats: { totalProducts: 0, totalOrders: 0, pendingOrders: 0, totalRevenue: 0 },
      salesStats: '[]',
      topProducts: [],
      ordersByStatus: {},
      revenueSummary: {},
      recentOrders: [],
      lowStockProducts: [],
      isDemoMode
    });
  }
});

async function getBasicStats() {
  if (isDemoMode) {
    return { totalProducts: 12, totalOrders: 156, pendingOrders: 8, totalRevenue: 68500, lowStock: 3 };
  }

  const [productsRes, ordersRes, pendingRes, revenueRes, lowStockRes] = await Promise.all([
    supabaseAdmin.from('products').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin.from('orders').select('total').eq('payment_status', 'paid'),
    supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).lt('stock_quantity', 20).eq('is_active', true)
  ]);

  return {
    totalProducts: productsRes.count || 0,
    totalOrders: ordersRes.count || 0,
    pendingOrders: pendingRes.count || 0,
    totalRevenue: revenueRes.data?.reduce((sum, o) => sum + parseFloat(o.total), 0) || 0,
    lowStock: lowStockRes.count || 0
  };
}

// ===========================================
// PRODUCTS CRUD
// ===========================================

router.get('/products', async (req, res) => {
  try {
    const { search, category, status, page = 1 } = req.query;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    let products, categories, count;

    if (isDemoMode) {
      products = [...demoProducts];
      categories = demoCategories;
      
      if (search) {
        const searchLower = search.toLowerCase();
        products = products.filter(p => p.name.toLowerCase().includes(searchLower));
      }
      if (category) products = products.filter(p => p.category_id === category);
      if (status === 'active') products = products.filter(p => p.is_active);
      else if (status === 'inactive') products = products.filter(p => !p.is_active);
      
      count = products.length;
      products = products.slice(offset, offset + limit);
    } else {
      let query = supabaseAdmin.from('products').select('*, categories(id, name, slug)', { count: 'exact' });

      if (search) query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%,sku.ilike.%${search}%`);
      if (category) query = query.eq('category_id', category);
      if (status === 'active') query = query.eq('is_active', true);
      else if (status === 'inactive') query = query.eq('is_active', false);

      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, error, count: totalCount } = await query;
      if (error) throw error;

      const { data: cats } = await supabaseAdmin.from('categories').select('*').order('name');
      products = data || [];
      categories = cats || [];
      count = totalCount;
    }

    res.render('admin/products', {
      title: 'Productos',
      products,
      categories,
      filters: { search, category, status },
      pagination: { page: parseInt(page), totalPages: Math.ceil(count / limit), total: count, hasNext: page < Math.ceil(count / limit), hasPrev: page > 1 },
      isDemoMode
    });
  } catch (error) {
    console.error('Products error:', error);
    req.session.error = 'Error al cargar productos';
    res.redirect('/admin');
  }
});

router.get('/products/new', async (req, res) => {
  const categories = isDemoMode ? demoCategories : (await supabaseAdmin.from('categories').select('*').eq('is_active', true).order('name')).data || [];
  res.render('admin/product-form', { title: 'Nuevo Producto', product: null, categories, isDemoMode });
});

router.post('/products', upload.array('images', 5), validateProduct, async (req, res) => {
  try {
    const { name, slug, category_id, price, sale_price, stock_quantity, weight, sku, short_description, description, is_active, is_featured, tags } = req.body;
    const productSlug = slug || generateSlug(name);
    
    // Default to placeholder image
    let image_url = imageUploadService.getPlaceholderUrl('product');
    let gallery_urls = [];
    
    // Upload images to Supabase Storage if provided
    if (req.files && req.files.length > 0) {
      const uploadResults = [];
      
      for (const file of req.files) {
        const result = await imageUploadService.uploadMulterFile(file, 'products');
        if (result.success) {
          uploadResults.push(result.url);
        } else {
          console.error('Image upload failed:', result.error);
        }
      }
      
      if (uploadResults.length > 0) {
        image_url = uploadResults[0]; // First image is main
        gallery_urls = uploadResults;
      }
    }

    if (isDemoMode) {
      req.session.success = '(Demo) Producto creado';
      return res.redirect('/admin/products');
    }

    const { error } = await supabaseAdmin.from('products').insert({
      name, slug: productSlug, category_id: category_id || null,
      price: parseFloat(price), sale_price: sale_price ? parseFloat(sale_price) : null,
      stock_quantity: parseInt(stock_quantity) || 0, weight, sku,
      short_description, description, image_url, gallery_urls,
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      is_active: is_active === 'on', is_featured: is_featured === 'on'
    });

    if (error) throw error;
    req.session.success = 'Producto creado exitosamente';
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Create product error:', error);
    req.session.error = 'Error al crear producto: ' + error.message;
    res.redirect('/admin/products/new');
  }
});

router.get('/products/:id/edit', async (req, res) => {
  const { id } = req.params;
  let product, categories;

  if (isDemoMode) {
    product = demoProducts.find(p => p.id === id);
    categories = demoCategories;
  } else {
    const { data } = await supabaseAdmin.from('products').select('*').eq('id', id).single();
    product = data;
    categories = (await supabaseAdmin.from('categories').select('*').eq('is_active', true).order('name')).data || [];
  }

  if (!product) {
    req.session.error = 'Producto no encontrado';
    return res.redirect('/admin/products');
  }

  res.render('admin/product-form', { title: 'Editar Producto', product, categories, isDemoMode });
});

router.post('/products/:id', upload.array('images', 5), validateProduct, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, category_id, price, sale_price, stock_quantity, weight, sku, short_description, description, is_active, is_featured, tags } = req.body;

    if (isDemoMode) {
      req.session.success = '(Demo) Producto actualizado';
      return res.redirect('/admin/products');
    }

    const updateData = {
      name, slug: slug || generateSlug(name), category_id: category_id || null,
      price: parseFloat(price), sale_price: sale_price ? parseFloat(sale_price) : null,
      stock_quantity: parseInt(stock_quantity) || 0, weight, sku, short_description, description,
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      is_active: is_active === 'on', is_featured: is_featured === 'on'
    };

    // Upload new images to Supabase if provided
    if (req.files && req.files.length > 0) {
      const uploadResults = [];
      
      for (const file of req.files) {
        const result = await imageUploadService.uploadMulterFile(file, 'products');
        if (result.success) {
          uploadResults.push(result.url);
        } else {
          console.error('Image upload failed:', result.error);
        }
      }
      
      if (uploadResults.length > 0) {
        updateData.image_url = uploadResults[0];
        updateData.gallery_urls = uploadResults;
      }
    }

    const { error } = await supabaseAdmin.from('products').update(updateData).eq('id', id);
    if (error) throw error;

    req.session.success = 'Producto actualizado exitosamente';
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Update product error:', error);
    req.session.error = 'Error al actualizar: ' + error.message;
    res.redirect(`/admin/products/${req.params.id}/edit`);
  }
});

router.post('/products/:id/delete', async (req, res) => {
  if (!isDemoMode) {
    await supabaseAdmin.from('products').delete().eq('id', req.params.id);
  }
  req.session.success = isDemoMode ? '(Demo) Producto eliminado' : 'Producto eliminado';
  res.redirect('/admin/products');
});

router.post('/products/:id/quick-update', express.json(), async (req, res) => {
  const { id } = req.params;
  const { field, value } = req.body;
  const allowedFields = ['is_active', 'is_featured', 'stock_quantity', 'price', 'sale_price'];
  
  if (!allowedFields.includes(field)) return res.status(400).json({ success: false, error: 'Campo no permitido' });
  if (isDemoMode) return res.json({ success: true, message: '(Demo)' });

  const updateData = {};
  updateData[field] = value;
  const { error } = await supabaseAdmin.from('products').update(updateData).eq('id', id);
  
  res.json(error ? { success: false, error: error.message } : { success: true });
});

// Bulk actions
router.post('/products/bulk', express.json(), async (req, res) => {
  const { action, ids } = req.body;
  
  if (!ids || ids.length === 0) return res.json({ success: false, error: 'No hay productos seleccionados' });
  if (isDemoMode) return res.json({ success: true, message: '(Demo) Acción aplicada' });

  try {
    switch (action) {
      case 'activate':
        await supabaseAdmin.from('products').update({ is_active: true }).in('id', ids);
        break;
      case 'deactivate':
        await supabaseAdmin.from('products').update({ is_active: false }).in('id', ids);
        break;
      case 'feature':
        await supabaseAdmin.from('products').update({ is_featured: true }).in('id', ids);
        break;
      case 'unfeature':
        await supabaseAdmin.from('products').update({ is_featured: false }).in('id', ids);
        break;
      case 'delete':
        await supabaseAdmin.from('products').delete().in('id', ids);
        break;
      default:
        return res.json({ success: false, error: 'Acción no válida' });
    }
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ===========================================
// ORDERS
// ===========================================

router.get('/orders', async (req, res) => {
  try {
    const { status, payment, search, page = 1 } = req.query;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    let orders, count;

    if (isDemoMode) {
      orders = [
        { id: '1', order_number: 'DEMO001', customer_name: 'María García', customer_email: 'maria@email.com', total: 580, status: 'pending', payment_status: 'pending', created_at: new Date() },
        { id: '2', order_number: 'DEMO002', customer_name: 'Juan Pérez', customer_email: 'juan@email.com', total: 750, status: 'shipped', payment_status: 'paid', tracking_number: 'MX123456789', created_at: new Date(Date.now() - 86400000) }
      ];
      count = orders.length;
    } else {
      let query = supabaseAdmin.from('orders').select('*', { count: 'exact' });

      if (status && status !== 'all') query = query.eq('status', status);
      if (payment && payment !== 'all') query = query.eq('payment_status', payment);
      if (search) query = query.or(`order_number.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`);

      query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      const { data, error, count: totalCount } = await query;
      if (error) throw error;

      orders = data || [];
      count = totalCount;
    }

    res.render('admin/orders', {
      title: 'Pedidos',
      orders,
      filters: { status: status || 'all', payment: payment || 'all', search },
      pagination: { page: parseInt(page), totalPages: Math.ceil(count / limit), total: count, hasNext: page < Math.ceil(count / limit), hasPrev: page > 1 },
      isDemoMode
    });
  } catch (error) {
    console.error('Orders error:', error);
    req.session.error = 'Error al cargar pedidos';
    res.redirect('/admin');
  }
});

router.get('/orders/:id', async (req, res) => {
  const { id } = req.params;
  let order, orderItems;

  if (isDemoMode) {
    order = { id: '1', order_number: 'DEMO001', customer_name: 'María García', customer_email: 'maria@email.com', customer_phone: '555-123-4567', shipping_address: { street: 'Calle Principal 123', city: 'CDMX', state: 'CDMX', postal_code: '06600', country: 'México' }, subtotal: 530, shipping_cost: 50, total: 580, status: 'pending', payment_status: 'pending', created_at: new Date() };
    orderItems = [{ product_name: 'Miel de Bosque Premium', product_image: '/assets/img/products/product-1.png', quantity: 2, unit_price: 265, total_price: 530 }];
  } else {
    const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', id).single();
    if (error || !data) {
      req.session.error = 'Pedido no encontrado';
      return res.redirect('/admin/orders');
    }
    order = data;
    const { data: items } = await supabaseAdmin.from('order_items').select('*').eq('order_id', id);
    orderItems = items || [];
  }

  res.render('admin/order-detail', { title: `Pedido #${order.order_number}`, order, orderItems, isDemoMode });
});

router.post('/orders/:id/update', validateOrderUpdate, async (req, res) => {
  const { id } = req.params;
  const { status, payment_status, tracking_number, tracking_url, admin_notes } = req.body;

  if (isDemoMode) {
    req.session.success = '(Demo) Pedido actualizado';
    return res.redirect(`/admin/orders/${id}`);
  }

  const updateData = {};
  if (status) {
    updateData.status = status;
    if (status === 'shipped') updateData.shipped_at = new Date().toISOString();
    else if (status === 'delivered') updateData.delivered_at = new Date().toISOString();
  }
  if (payment_status) updateData.payment_status = payment_status;
  if (tracking_number !== undefined) updateData.tracking_number = tracking_number || null;
  if (tracking_url !== undefined) updateData.tracking_url = tracking_url || null;
  if (admin_notes !== undefined) updateData.admin_notes = admin_notes || null;

  const { error } = await supabaseAdmin.from('orders').update(updateData).eq('id', id);
  
  req.session.success = error ? 'Error al actualizar' : 'Pedido actualizado';
  res.redirect(`/admin/orders/${id}`);
});

// ===========================================
// CATEGORIES
// ===========================================

router.get('/categories', async (req, res) => {
  const categories = isDemoMode ? demoCategories : (await supabaseAdmin.from('categories').select('*').order('sort_order')).data || [];
  res.render('admin/categories', { title: 'Categorías', categories, isDemoMode });
});

router.post('/categories', async (req, res) => {
  const { name, description, sort_order } = req.body;
  
  if (!isDemoMode) {
    await supabaseAdmin.from('categories').insert({ name, slug: generateSlug(name), description, sort_order: parseInt(sort_order) || 0, is_active: true });
  }
  
  req.session.success = isDemoMode ? '(Demo) Categoría creada' : 'Categoría creada';
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', async (req, res) => {
  if (!isDemoMode) await supabaseAdmin.from('categories').delete().eq('id', req.params.id);
  req.session.success = isDemoMode ? '(Demo) Categoría eliminada' : 'Categoría eliminada';
  res.redirect('/admin/categories');
});

// ===========================================
// COUPONS
// ===========================================

router.get('/coupons', async (req, res) => {
  const { data: coupons } = await couponsService.getCoupons();
  res.render('admin/coupons', { title: 'Cupones', coupons, isDemoMode });
});

router.post('/coupons', async (req, res) => {
  try {
    await couponsService.createCoupon(req.body);
    req.session.success = 'Cupón creado';
  } catch (error) {
    req.session.error = 'Error al crear cupón: ' + error.message;
  }
  res.redirect('/admin/coupons');
});

router.post('/coupons/:id/toggle', async (req, res) => {
  const { id } = req.params;
  const coupon = await couponsService.getCouponById(id);
  if (coupon) await couponsService.updateCoupon(id, { is_active: !coupon.is_active });
  res.redirect('/admin/coupons');
});

router.post('/coupons/:id/delete', async (req, res) => {
  await couponsService.deleteCoupon(req.params.id);
  req.session.success = 'Cupón eliminado';
  res.redirect('/admin/coupons');
});

// ===========================================
// USERS
// ===========================================

router.get('/users', async (req, res) => {
  const { search, role, blocked, page = 1 } = req.query;
  const { data: users, count } = await usersService.getUsers({ search, role, blocked: blocked === 'true' ? true : blocked === 'false' ? false : undefined, limit: 20, offset: (page - 1) * 20 });
  const stats = await usersService.getCustomerStats();

  res.render('admin/users', {
    title: 'Usuarios',
    users,
    stats,
    filters: { search, role, blocked },
    pagination: { page: parseInt(page), totalPages: Math.ceil(count / 20), total: count },
    isDemoMode
  });
});

router.get('/users/:id', async (req, res) => {
  const user = await usersService.getUserById(req.params.id);
  if (!user) {
    req.session.error = 'Usuario no encontrado';
    return res.redirect('/admin/users');
  }
  res.render('admin/user-detail', { title: user.full_name || user.email, user, isDemoMode });
});

router.post('/users/:id/toggle-block', async (req, res) => {
  const { blocked, notes } = req.body;
  await usersService.toggleUserBlock(req.params.id, blocked === 'true', notes);
  req.session.success = `Usuario ${blocked === 'true' ? 'bloqueado' : 'desbloqueado'}`;
  res.redirect(`/admin/users/${req.params.id}`);
});

// ===========================================
// SHIPPING
// ===========================================

router.get('/shipping', async (req, res) => {
  const zones = await shippingService.getShippingZones();
  res.render('admin/shipping', { title: 'Envíos', zones, states: shippingService.mexicanStates, isDemoMode });
});

router.post('/shipping/zones', async (req, res) => {
  const { name, states } = req.body;
  await shippingService.createShippingZone({ name, states: Array.isArray(states) ? states : [states] });
  req.session.success = 'Zona creada';
  res.redirect('/admin/shipping');
});

router.post('/shipping/rates', async (req, res) => {
  await shippingService.createShippingRate(req.body);
  req.session.success = 'Tarifa creada';
  res.redirect('/admin/shipping');
});

// ===========================================
// SHIPMENTS MANAGEMENT
// ===========================================

// Shipments dashboard
router.get('/shipments', async (req, res) => {
  try {
    let pendingOrders = [];
    let activeShipments = [];
    let shipmentHistory = [];
    let scheduledPickups = [];
    let stats = { pendingShipments: 0, inTransit: 0, deliveredToday: 0, pendingPickup: 0 };

    if (isDemoMode) {
      // Demo data
      pendingOrders = [
        { id: '1', order_number: 'DEMO001', customer_name: 'María García', customer_email: 'maria@test.com', total: 580, payment_status: 'paid', shipping_address: { city: 'CDMX', state: 'CDMX', postal_code: '06600' }, created_at: new Date() },
        { id: '2', order_number: 'DEMO002', customer_name: 'Juan Pérez', customer_email: 'juan@test.com', total: 750, payment_status: 'paid', shipping_address: { city: 'Guadalajara', state: 'Jalisco', postal_code: '44100' }, created_at: new Date(Date.now() - 86400000) }
      ];
      activeShipments = [
        { order_number: 'DEMO003', customer_name: 'Ana López', tracking_number: 'MX123456789', carrier: 'Estafeta', status: 'in_transit', created_at: new Date(Date.now() - 172800000) }
      ];
      stats = { pendingShipments: 2, inTransit: 1, deliveredToday: 0, pendingPickup: 0 };
    } else {
      // Get pending orders (paid but not shipped)
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('payment_status', 'paid')
        .in('status', ['pending', 'confirmed', 'processing'])
        .is('tracking_number', null)
        .order('created_at', { ascending: false });
      pendingOrders = orders || [];

      // Get active shipments
      const { data: shipments } = await supabaseAdmin
        .from('shipments')
        .select('*, orders(order_number, customer_name)')
        .in('status', ['label_created', 'picked_up', 'in_transit', 'out_for_delivery'])
        .order('created_at', { ascending: false });
      activeShipments = (shipments || []).map(s => ({
        ...s,
        order_number: s.orders?.order_number,
        customer_name: s.orders?.customer_name
      }));

      // Get shipment history
      const { data: history } = await supabaseAdmin
        .from('shipments')
        .select('*, orders(order_number)')
        .order('created_at', { ascending: false })
        .limit(50);
      shipmentHistory = (history || []).map(s => ({
        ...s,
        order_number: s.orders?.order_number
      }));

      // Calculate stats
      stats.pendingShipments = pendingOrders.length;
      stats.inTransit = activeShipments.length;
      
      const today = new Date().toISOString().split('T')[0];
      const { count: deliveredCount } = await supabaseAdmin
        .from('shipments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'delivered')
        .gte('delivered_at', today);
      stats.deliveredToday = deliveredCount || 0;
    }

    // Helper function for status translation
    const translateStatus = (status) => {
      const statuses = {
        'pending': 'Pendiente',
        'label_created': 'Guía creada',
        'picked_up': 'Recolectado',
        'in_transit': 'En tránsito',
        'out_for_delivery': 'En reparto',
        'delivered': 'Entregado',
        'exception': 'Incidencia',
        'returned': 'Devuelto',
        'cancelled': 'Cancelado'
      };
      return statuses[status] || status;
    };

    res.render('admin/shipments', {
      title: 'Gestión de Envíos',
      pendingOrders,
      activeShipments,
      shipmentHistory,
      scheduledPickups,
      stats,
      translateStatus,
      isDemoMode,
      isEnviaConfigured: enviaService.isEnviaConfigured
    });
  } catch (error) {
    console.error('Shipments error:', error);
    res.render('admin/shipments', {
      title: 'Gestión de Envíos',
      pendingOrders: [],
      activeShipments: [],
      shipmentHistory: [],
      scheduledPickups: [],
      stats: { pendingShipments: 0, inTransit: 0, deliveredToday: 0, pendingPickup: 0 },
      translateStatus: s => s,
      isDemoMode,
      error: error.message
    });
  }
});

// Get shipping quotes for an order
router.get('/shipments/quotes/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    let order;
    if (isDemoMode) {
      order = {
        id: orderId,
        order_number: 'DEMO001',
        shipping_address: { city: 'CDMX', state: 'CDMX', postal_code: '06600', street: 'Calle Test 123' }
      };
    } else {
      const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
      if (error || !data) {
        return res.json({ success: false, error: 'Pedido no encontrado' });
      }
      order = data;
    }

    const address = order.shipping_address || {};
    
    // Get quotes from Envia
    const result = await enviaService.getShippingQuotes(
      {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone,
        street: address.street || 'Calle',
        city: address.city || 'Ciudad',
        state: address.state || 'Estado',
        postalCode: address.postal_code || '00000',
        country: 'MX'
      },
      [{ content: 'Miel artesanal', quantity: 1, weight: 1, declaredValue: order.total || 500 }]
    );

    res.json({
      success: true,
      quotes: result.quotes || [],
      isFallback: result.isFallback || false
    });
  } catch (error) {
    console.error('Quotes error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Create shipping label
router.post('/shipments/create-label', async (req, res) => {
  try {
    const { orderId, carrier, serviceId } = req.body;

    if (isDemoMode) {
      return res.json({
        success: true,
        trackingNumber: 'DEMO' + Date.now(),
        labelUrl: '#',
        message: '(Demo) Guía creada'
      });
    }

    // Get order details
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.json({ success: false, error: 'Pedido no encontrado' });
    }

    const address = order.shipping_address || {};

    // Create label via Envia
    const result = await enviaService.createShippingLabel({
      destination: {
        name: order.customer_name,
        email: order.customer_email,
        phone: order.customer_phone || '',
        street: address.street || '',
        number: address.number || '',
        city: address.city || '',
        state: address.state || '',
        postalCode: address.postal_code || '',
        country: 'MX'
      },
      packages: [{ content: 'Miel artesanal', quantity: 1, weight: 1, declaredValue: order.total || 500 }],
      carrier,
      serviceId,
      orderId: order.id,
      orderNumber: order.order_number
    });

    if (result.success) {
      // Save shipment to DB
      await supabaseAdmin.from('shipments').insert({
        order_id: orderId,
        carrier,
        service: serviceId,
        tracking_number: result.trackingNumber,
        label_url: result.labelUrl,
        label_id: result.labelId,
        status: 'label_created',
        estimated_delivery: result.estimatedDelivery
      });

      // Update order with tracking
      await supabaseAdmin
        .from('orders')
        .update({
          tracking_number: result.trackingNumber,
          tracking_url: result.labelUrl,
          shipping_carrier: carrier,
          status: 'shipped'
        })
        .eq('id', orderId);

      // Send shipping confirmation email
      try {
        await emailService.sendShippingConfirmation(order, {
          tracking_number: result.trackingNumber,
          carrier: carrier,
          carrier_name: carrier.charAt(0).toUpperCase() + carrier.slice(1),
          tracking_url: result.labelUrl,
          estimated_delivery: result.estimatedDelivery
        });
      } catch (emailErr) {
        console.error('Email error (non-blocking):', emailErr);
      }
    }

    res.json({
      success: result.success,
      trackingNumber: result.trackingNumber,
      labelUrl: result.labelUrl,
      error: result.success ? null : 'Error al crear guía'
    });
  } catch (error) {
    console.error('Create label error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Track shipment
router.get('/shipments/track/:tracking', async (req, res) => {
  try {
    const { tracking } = req.params;
    const { carrier } = req.query;

    // Validate tracking number
    if (!tracking || tracking === 'undefined' || tracking === 'null') {
      return res.json({ success: false, error: 'Número de rastreo no proporcionado' });
    }

    if (!carrier) {
      return res.json({ success: false, error: 'Carrier no especificado' });
    }

    if (isDemoMode) {
      return res.json({
        success: true,
        trackingNumber: tracking,
        status: 'in_transit',
        events: [
          { date: new Date(), location: 'CDMX', description: 'En tránsito hacia destino' },
          { date: new Date(Date.now() - 86400000), location: 'Xalapa', description: 'Paquete recolectado' }
        ]
      });
    }

    const result = await enviaService.trackShipment(tracking, carrier);
    res.json(result);
  } catch (error) {
    console.error('Track error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Schedule pickup
router.post('/shipments/schedule-pickup', async (req, res) => {
  try {
    const { carrier, pickup_date, time_start, time_end, tracking_numbers } = req.body;

    if (isDemoMode) {
      return res.json({ success: true, message: '(Demo) Recolección programada' });
    }

    const trackings = tracking_numbers ? tracking_numbers.split(',').map(t => t.trim()) : [];

    const result = await enviaService.schedulePickup({
      carrier,
      trackingNumbers: trackings,
      pickupDate: pickup_date,
      pickupTimeStart: time_start,
      pickupTimeEnd: time_end,
      packages: trackings.length || 1
    });

    res.json(result);
  } catch (error) {
    console.error('Pickup error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Cancel shipment
router.post('/shipments/cancel/:labelId', async (req, res) => {
  try {
    const { labelId } = req.params;
    const { carrier } = req.body;

    if (isDemoMode) {
      return res.json({ success: true, message: '(Demo) Envío cancelado' });
    }

    const result = await enviaService.cancelShipment(labelId, carrier);

    if (result.success) {
      await supabaseAdmin
        .from('shipments')
        .update({ status: 'cancelled' })
        .eq('label_id', labelId);
    }

    res.json(result);
  } catch (error) {
    console.error('Cancel error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ===========================================
// REPORTS
// ===========================================

router.get('/reports', async (req, res) => {
  const { period = '30' } = req.query;
  
  const [salesStats, topProducts, ordersByStatus, revenueSummary, customerStats, inventoryReport] = await Promise.all([
    reportsService.getSalesStats(parseInt(period)),
    reportsService.getTopProducts(10),
    reportsService.getOrdersByStatus(),
    reportsService.getRevenueSummary(),
    reportsService.getCustomerStats(),
    reportsService.getInventoryReport()
  ]);

  res.render('admin/reports', {
    title: 'Reportes',
    period,
    salesStats: JSON.stringify(salesStats),
    topProducts,
    ordersByStatus,
    revenueSummary,
    customerStats,
    inventoryReport,
    isDemoMode
  });
});

router.get('/reports/export/:type', async (req, res) => {
  const { type } = req.params;
  const { period = '30' } = req.query;
  
  let data, columns, filename;
  
  switch (type) {
    case 'sales':
      data = await reportsService.getSalesStats(parseInt(period));
      columns = [
        { key: 'date', label: 'Fecha' },
        { key: 'total_orders', label: 'Pedidos' },
        { key: 'total_revenue', label: 'Ingresos' },
        { key: 'avg_order_value', label: 'Ticket Promedio' }
      ];
      filename = 'ventas';
      break;
    case 'products':
      data = await reportsService.getTopProducts(100);
      columns = [
        { key: 'product_name', label: 'Producto' },
        { key: 'total_sold', label: 'Vendidos' },
        { key: 'total_revenue', label: 'Ingresos' }
      ];
      filename = 'productos';
      break;
    default:
      return res.status(400).send('Tipo de reporte no válido');
  }

  const csv = reportsService.exportToCSV(data, columns);
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  res.send(csv);
});

// ===========================================
// SETTINGS
// ===========================================

router.get('/settings', async (req, res) => {
  let settings = {};
  
  if (!isDemoMode) {
    const { data } = await supabaseAdmin.from('store_settings').select('*');
    if (data) {
      data.forEach(s => { settings[s.key] = s.value; });
    }
  }

  res.render('admin/settings', { title: 'Configuración', settings, isDemoMode });
});

router.post('/settings', async (req, res) => {
  const { key, value } = req.body;
  
  if (!isDemoMode) {
    await supabaseAdmin.from('store_settings').upsert({ key, value: JSON.parse(value) }, { onConflict: 'key' });
  }
  
  req.session.success = 'Configuración guardada';
  res.redirect('/admin/settings');
});

// ===========================================
// IMAGE GENERATION & UPLOAD
// ===========================================

router.get('/images', async (req, res) => {
  // Get products for linking generated images
  let products = [];
  if (isDemoMode) {
    products = demoProducts.map(p => ({ id: p.id, name: p.name, image_url: p.image_url }));
  } else {
    const { data } = await supabaseAdmin.from('products').select('id, name, image_url').order('name');
    products = data || [];
  }
  
  res.render('admin/images', { 
    title: 'Imágenes IA', 
    prompts: listPrompts(), 
    products,
    isGeminiConfigured, 
    isDemoMode,
    storageBaseUrl: imageUploadService.config.STORAGE_BASE_URL
  });
});

router.post('/images/generate/:key', async (req, res) => {
  if (!isGeminiConfigured) return res.json({ success: false, error: 'Gemini API no configurada' });
  const result = await generateImage(req.params.key);
  res.json(result);
});

// Upload generated image to Supabase and optionally link to product
router.post('/images/upload', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { base64, filename, mimeType, productId } = req.body;
    
    if (!base64 || !filename) {
      return res.json({ success: false, error: 'Faltan datos de imagen' });
    }
    
    // Upload to Supabase Storage
    const uploadResult = await imageUploadService.uploadBase64(base64, filename, mimeType || 'image/png');
    
    if (!uploadResult.success) {
      return res.json({ success: false, error: uploadResult.error });
    }
    
    // If productId provided, update product's image_url
    if (productId && !isDemoMode) {
      const { error } = await supabaseAdmin
        .from('products')
        .update({ image_url: uploadResult.url })
        .eq('id', productId);
      
      if (error) {
        console.error('Error linking image to product:', error);
        // Don't fail the upload, just warn
        return res.json({ 
          success: true, 
          url: uploadResult.url,
          warning: 'Imagen subida pero no se pudo vincular al producto'
        });
      }
      
      return res.json({ 
        success: true, 
        url: uploadResult.url,
        linked: true,
        message: 'Imagen subida y vinculada al producto'
      });
    }
    
    res.json({ success: true, url: uploadResult.url });
  } catch (error) {
    console.error('Image upload error:', error);
    res.json({ success: false, error: error.message });
  }
});

// AJAX endpoint for image upload via form
router.post('/images/upload-file', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, error: 'No se recibió imagen' });
    }
    
    const folder = req.body.folder || 'products';
    const result = await imageUploadService.uploadMulterFile(req.file, folder);
    
    if (!result.success) {
      return res.json({ success: false, error: result.error });
    }
    
    // If productId provided, update product
    if (req.body.productId && !isDemoMode) {
      await supabaseAdmin
        .from('products')
        .update({ image_url: result.url })
        .eq('id', req.body.productId);
    }
    
    res.json({ success: true, url: result.url });
  } catch (error) {
    console.error('File upload error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Delete an image
router.post('/images/delete', express.json(), async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.json({ success: false, error: 'URL no proporcionada' });
    }
    
    const result = await imageUploadService.deleteImage(url);
    res.json(result);
  } catch (error) {
    console.error('Delete image error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ===========================================
// PROMOTIONS
// ===========================================

router.get('/promotions', async (req, res) => {
  try {
    const { filter } = req.query;
    const { data: promotions } = await promotionsService.getPromotions({
      active: filter === 'active' ? true : undefined,
      status: filter
    });
    
    const stats = {
      active: promotions.filter(p => p.is_active && (!p.ends_at || new Date(p.ends_at) > new Date())).length,
      scheduled: promotions.filter(p => new Date(p.starts_at) > new Date()).length,
      totalUses: promotions.reduce((sum, p) => sum + (p.current_uses || 0), 0),
      totalDiscount: promotions.reduce((sum, p) => sum + ((p.current_uses || 0) * (p.discount_value || 0)), 0)
    };
    
    res.render('admin/promotions', {
      title: 'Promociones',
      promotions,
      stats,
      filter,
      promoTypes: promotionsService.PROMOTION_TYPES,
      isDemoMode
    });
  } catch (error) {
    console.error('Promotions error:', error);
    req.session.error = 'Error al cargar promociones';
    res.redirect('/admin');
  }
});

router.post('/promotions', async (req, res) => {
  try {
    await promotionsService.createPromotion(req.body);
    req.session.success = 'Promoción creada';
  } catch (error) {
    req.session.error = 'Error al crear promoción: ' + error.message;
  }
  res.redirect('/admin/promotions');
});

router.post('/promotions/:id/toggle', async (req, res) => {
  try {
    const promo = await promotionsService.getPromotionById(req.params.id);
    if (promo) {
      await promotionsService.updatePromotion(req.params.id, { is_active: !promo.is_active });
    }
  } catch (error) {
    req.session.error = 'Error al actualizar promoción';
  }
  res.redirect('/admin/promotions');
});

router.post('/promotions/:id/delete', async (req, res) => {
  try {
    await promotionsService.deletePromotion(req.params.id);
    req.session.success = 'Promoción eliminada';
  } catch (error) {
    req.session.error = 'Error al eliminar promoción';
  }
  res.redirect('/admin/promotions');
});

// ===========================================
// INVENTORY
// ===========================================

router.get('/inventory', async (req, res) => {
  try {
    const [summary, lowStock, outOfStock, valuation, projection, { data: movements }, products] = await Promise.all([
      inventoryService.getInventorySummary(),
      inventoryService.getLowStockProducts(),
      inventoryService.getOutOfStockProducts(),
      inventoryService.getInventoryValuation(),
      inventoryService.getStockProjection(7),
      inventoryService.getInventoryMovements({ limit: 20 }),
      isDemoMode ? Promise.resolve(demoProducts) : supabaseAdmin.from('products').select('id, name, stock_quantity').eq('is_active', true).order('name').then(r => r.data || [])
    ]);
    
    res.render('admin/inventory', {
      title: 'Inventario',
      summary,
      lowStock,
      outOfStock,
      valuation,
      projection,
      movements,
      products,
      movementTypes: inventoryService.MOVEMENT_TYPES,
      isDemoMode
    });
  } catch (error) {
    console.error('Inventory error:', error);
    req.session.error = 'Error al cargar inventario';
    res.redirect('/admin');
  }
});

router.post('/inventory/adjust', async (req, res) => {
  try {
    const { product_id, type, quantity, notes } = req.body;
    await inventoryService.adjustStock(product_id, parseInt(quantity), {
      type,
      notes,
      userId: req.session.user?.id
    });
    req.session.success = 'Stock ajustado correctamente';
  } catch (error) {
    req.session.error = 'Error al ajustar stock: ' + error.message;
  }
  res.redirect('/admin/inventory');
});

router.post('/inventory/bulk-adjust', async (req, res) => {
  try {
    const { type, adjustments_text, notes } = req.body;
    
    // Parse adjustments text
    const lines = adjustments_text.trim().split('\n');
    const adjustments = [];
    
    for (const line of lines) {
      const [sku, qty] = line.split(',').map(s => s.trim());
      if (sku && qty) {
        // Find product by SKU
        let product;
        if (isDemoMode) {
          product = demoProducts.find(p => p.sku === sku);
        } else {
          const { data } = await supabaseAdmin.from('products').select('id').eq('sku', sku).single();
          product = data;
        }
        
        if (product) {
          adjustments.push({ product_id: product.id, quantity: parseInt(qty) });
        }
      }
    }
    
    if (adjustments.length > 0) {
      await inventoryService.bulkAdjustStock(adjustments, { type, notes, userId: req.session.user?.id });
      req.session.success = `${adjustments.length} ajustes procesados`;
    } else {
      req.session.error = 'No se encontraron productos válidos';
    }
  } catch (error) {
    req.session.error = 'Error en ajuste masivo: ' + error.message;
  }
  res.redirect('/admin/inventory');
});

// ===========================================
// INTEGRATIONS
// ===========================================

router.get('/integrations', async (req, res) => {
  try {
    const tab = req.query.tab || 'keys';
    
    let apiKeys = [];
    let webhooks = [];
    let webhookLogs = [];
    
    if (tab === 'keys') {
      if (isDemoMode) {
        apiKeys = [
          { id: '1', name: 'n8n-automation', prefix: 'modhu_nw', permissions: ['read:*', 'write:orders'], rate_limit: 100, is_active: true },
          { id: '2', name: 'respond-bot', prefix: 'modhu_rs', permissions: ['read:orders', 'read:customers'], rate_limit: 50, is_active: true }
        ];
      } else {
        const { data } = await supabaseAdmin.from('api_keys').select('*').order('created_at', { ascending: false });
        apiKeys = data || [];
      }
    } else if (tab === 'webhooks') {
      webhooks = await webhooksService.getWebhooks();
    } else if (tab === 'logs') {
      webhookLogs = await webhooksService.getWebhookLogs(null, 50);
    }
    
    res.render('admin/integrations', {
      title: 'Integraciones',
      tab,
      apiKeys,
      webhooks,
      webhookLogs,
      webhookEvents: webhooksService.WEBHOOK_EVENTS,
      baseUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
      isDemoMode
    });
  } catch (error) {
    console.error('Integrations error:', error);
    req.session.error = 'Error al cargar integraciones';
    res.redirect('/admin');
  }
});

router.post('/integrations/keys', async (req, res) => {
  try {
    const { name, permissions, rate_limit } = req.body;
    const perms = Array.isArray(permissions) ? permissions : permissions ? [permissions] : [];
    
    const { key, prefix, keyHash } = generateApiKey();
    
    if (!isDemoMode) {
      await supabaseAdmin.from('api_keys').insert({
        name,
        prefix,
        key_hash: keyHash,
        permissions: perms,
        rate_limit: parseInt(rate_limit) || 100,
        is_active: true
      });
    }
    
    // Store key temporarily to show to user
    req.session.newApiKey = key;
    req.session.success = `API Key creada. Guárdala ahora, no se mostrará de nuevo: ${key}`;
  } catch (error) {
    req.session.error = 'Error al crear API key: ' + error.message;
  }
  res.redirect('/admin/integrations?tab=keys');
});

router.post('/integrations/keys/:id/delete', async (req, res) => {
  try {
    if (!isDemoMode) {
      await supabaseAdmin.from('api_keys').delete().eq('id', req.params.id);
    }
    req.session.success = 'API Key eliminada';
  } catch (error) {
    req.session.error = 'Error al eliminar API key';
  }
  res.redirect('/admin/integrations?tab=keys');
});

router.post('/integrations/webhooks', async (req, res) => {
  try {
    const { name, url, events } = req.body;
    const eventsList = Array.isArray(events) ? events : events ? [events] : [];
    
    const result = await webhooksService.createWebhook({ name, url, events: eventsList });
    
    if (result.secret) {
      req.session.success = `Webhook creado. Secret: ${result.secret}`;
    } else {
      req.session.success = 'Webhook creado';
    }
  } catch (error) {
    req.session.error = 'Error al crear webhook: ' + error.message;
  }
  res.redirect('/admin/integrations?tab=webhooks');
});

router.post('/integrations/webhooks/:id/toggle', async (req, res) => {
  try {
    const webhook = await webhooksService.getWebhookById(req.params.id);
    if (webhook) {
      await webhooksService.updateWebhook(req.params.id, { is_active: !webhook.is_active });
    }
  } catch (error) {
    req.session.error = 'Error al actualizar webhook';
  }
  res.redirect('/admin/integrations?tab=webhooks');
});

router.post('/integrations/webhooks/:id/test', async (req, res) => {
  try {
    const result = await webhooksService.testWebhook(req.params.id);
    if (result.success) {
      req.session.success = `Test exitoso: ${result.status_code} (${result.response_time}ms)`;
    } else {
      req.session.error = `Test falló: ${result.error || result.status_code}`;
    }
  } catch (error) {
    req.session.error = 'Error al probar webhook: ' + error.message;
  }
  res.redirect('/admin/integrations?tab=webhooks');
});

router.post('/integrations/webhooks/:id/delete', async (req, res) => {
  try {
    await webhooksService.deleteWebhook(req.params.id);
    req.session.success = 'Webhook eliminado';
  } catch (error) {
    req.session.error = 'Error al eliminar webhook';
  }
  res.redirect('/admin/integrations?tab=webhooks');
});

// =============================================
// MAILING
// =============================================

// Mailing dashboard
router.get('/mailing', async (req, res) => {
  res.render('admin/mailing', {
    title: 'Email Marketing',
    activePage: 'mailing',
    isEmailConfigured: emailService.isEmailConfigured,
    fromEmail: process.env.EMAIL_FROM || 'Miel de Sol <pedidos@mieldesol.com>'
  });
});

// Send test email
router.post('/mailing/test', async (req, res) => {
  try {
    const { email, template } = req.body;

    if (!email) {
      return res.json({ success: false, error: 'Email requerido' });
    }

    // Sample data for templates
    const sampleOrder = {
      order_number: 'TEST-001',
      customer_name: 'Usuario de Prueba',
      customer_email: email,
      status: 'confirmed',
      subtotal: 450,
      shipping_cost: 99,
      discount: 0,
      total: 549,
      created_at: new Date(),
      shipping_address: {
        street: 'Calle Ejemplo 123',
        city: 'Ciudad de México',
        state: 'CDMX',
        postal_code: '06600',
        country: 'México'
      }
    };

    const sampleItems = [
      { product_name: 'Miel de Azahar 500g', quantity: 2, total_price: 300, product_image: null },
      { product_name: 'Miel Multiflora 250g', quantity: 1, total_price: 150, product_image: null }
    ];

    const sampleShipment = {
      tracking_number: 'MX1234567890',
      carrier: 'Estafeta',
      carrier_name: 'Estafeta',
      tracking_url: 'https://rastreo.estafeta.com/MX1234567890',
      estimated_delivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    };

    const sampleUser = {
      full_name: 'Usuario de Prueba',
      email: email
    };

    const sampleProducts = [
      { name: 'Miel de Azahar 500g', stock_quantity: 3, low_stock_threshold: 10 },
      { name: 'Miel Multiflora 1kg', stock_quantity: 5, low_stock_threshold: 10 }
    ];

    let subject, html;

    switch (template) {
      case 'welcome':
        subject = '¡Bienvenido a Miel de Sol! 🍯 (Email de prueba)';
        html = emailService.welcomeTemplate(sampleUser);
        break;
      case 'order_confirmation':
        subject = 'Pedido #TEST-001 confirmado (Email de prueba)';
        html = emailService.orderConfirmationTemplate(sampleOrder, sampleItems);
        break;
      case 'shipping':
        subject = 'Tu pedido ha sido enviado (Email de prueba)';
        html = emailService.shippingConfirmationTemplate(sampleOrder, sampleShipment);
        break;
      case 'delivered':
        subject = 'Pedido entregado (Email de prueba)';
        html = emailService.orderDeliveredTemplate(sampleOrder);
        break;
      case 'password_reset':
        subject = 'Restablecer contraseña (Email de prueba)';
        html = emailService.passwordResetTemplate(sampleUser, 'test-token-12345');
        break;
      case 'low_stock':
        subject = '⚠️ Alerta de Stock Bajo (Email de prueba)';
        html = emailService.lowStockAlertTemplate(sampleProducts);
        break;
      default:
        return res.json({ success: false, error: 'Template no válido' });
    }

    const result = await emailService.sendEmail({
      to: email,
      subject: subject,
      html: html
    });

    res.json({
      success: true,
      message: emailService.isEmailConfigured 
        ? `Email enviado correctamente a ${email}` 
        : `Email simulado (Resend no configurado). Revisa los logs del servidor.`,
      id: result.id
    });

  } catch (error) {
    console.error('Test email error:', error);
    res.json({ success: false, error: error.message || 'Error al enviar email' });
  }
});

// Preview email template
router.get('/mailing/preview/:template', async (req, res) => {
  try {
    const { template } = req.params;

    // Sample data
    const sampleOrder = {
      order_number: 'PREVIEW-001',
      customer_name: 'Cliente Ejemplo',
      customer_email: 'cliente@ejemplo.com',
      status: 'confirmed',
      subtotal: 580,
      shipping_cost: 0,
      discount: 50,
      total: 530,
      created_at: new Date(),
      shipping_address: {
        street: 'Av. Insurgentes Sur 1234, Col. Del Valle',
        city: 'Ciudad de México',
        state: 'CDMX',
        postal_code: '03100',
        country: 'México'
      }
    };

    const sampleItems = [
      { product_name: 'Miel Pura de Azahar 500g', quantity: 2, total_price: 380, product_image: null },
      { product_name: 'Miel Cremada con Canela 250g', quantity: 1, total_price: 200, product_image: null }
    ];

    const sampleShipment = {
      tracking_number: 'MX9876543210',
      carrier: 'Estafeta',
      carrier_name: 'Estafeta Express',
      tracking_url: 'https://rastreo.estafeta.com/MX9876543210',
      estimated_delivery: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
    };

    const sampleUser = {
      full_name: 'María González',
      email: 'maria@ejemplo.com'
    };

    const sampleProducts = [
      { name: 'Miel de Azahar 1kg', stock_quantity: 2, low_stock_threshold: 10 },
      { name: 'Set Degustación', stock_quantity: 5, low_stock_threshold: 15 },
      { name: 'Miel con Polen', stock_quantity: 8, low_stock_threshold: 10 }
    ];

    let html;

    switch (template) {
      case 'welcome':
        html = emailService.welcomeTemplate(sampleUser);
        break;
      case 'order_confirmation':
        html = emailService.orderConfirmationTemplate(sampleOrder, sampleItems);
        break;
      case 'shipping':
        html = emailService.shippingConfirmationTemplate(sampleOrder, sampleShipment);
        break;
      case 'delivered':
        html = emailService.orderDeliveredTemplate(sampleOrder);
        break;
      case 'password_reset':
        html = emailService.passwordResetTemplate(sampleUser, 'preview-token-xyz');
        break;
      case 'low_stock':
        html = emailService.lowStockAlertTemplate(sampleProducts);
        break;
      default:
        return res.status(404).send('Template no encontrado');
    }

    res.send(html);

  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).send('Error generando preview');
  }
});

export default router;
