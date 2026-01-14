import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabaseAdmin, isDemoMode } from '../config/supabase.js';
import { requireAuth, requireAdmin } from './auth.js';
import { products as demoProducts, categories as demoCategories, demoDb } from '../data/demo-data.js';
import { isGeminiConfigured, generateImage, listPrompts } from '../services/imageGenerator.js';
import { adminLimiter, validateProduct, validateOrderUpdate } from '../middleware/security.js';

// Import new services
import * as couponsService from '../services/coupons.js';
import * as reportsService from '../services/reports.js';
import * as shippingService from '../services/shipping.js';
import * as usersService from '../services/users.js';
import * as seoService from '../services/seo.js';
import * as promotionsService from '../services/promotions.js';
import * as inventoryService from '../services/inventory.js';
import * as webhooksService from '../services/webhooks.js';
import { generateApiKey, hashApiKey } from '../middleware/api-auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/products'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Solo se permiten imágenes'));
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
    
    let image_url = '/assets/img/products/product-1.png';
    let gallery_urls = [];
    
    if (req.files && req.files.length > 0) {
      image_url = `/uploads/products/${req.files[0].filename}`;
      gallery_urls = req.files.map(f => `/uploads/products/${f.filename}`);
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
    req.session.success = 'Producto creado';
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Create product error:', error);
    req.session.error = 'Error al crear producto';
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

    if (req.files && req.files.length > 0) {
      updateData.image_url = `/uploads/products/${req.files[0].filename}`;
      updateData.gallery_urls = req.files.map(f => `/uploads/products/${f.filename}`);
    }

    const { error } = await supabaseAdmin.from('products').update(updateData).eq('id', id);
    if (error) throw error;

    req.session.success = 'Producto actualizado';
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Update product error:', error);
    req.session.error = 'Error al actualizar';
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
// IMAGE GENERATION
// ===========================================

router.get('/images', (req, res) => {
  res.render('admin/images', { title: 'Imágenes IA', prompts: listPrompts(), isGeminiConfigured, isDemoMode });
});

router.post('/images/generate/:key', async (req, res) => {
  if (!isGeminiConfigured) return res.json({ success: false, error: 'Gemini API no configurada' });
  const result = await generateImage(req.params.key);
  res.json(result);
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

export default router;
