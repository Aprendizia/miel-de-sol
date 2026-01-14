/**
 * Inventory Service
 * Advanced inventory management with movements, alerts, and valuations
 */
import { supabaseAdmin, isDemoMode } from '../config/supabase.js';
import * as webhooksService from './webhooks.js';

// Movement types
export const MOVEMENT_TYPES = {
  purchase: { name: 'Compra', icon: '📥', color: 'success' },
  sale: { name: 'Venta', icon: '📤', color: 'info' },
  adjustment: { name: 'Ajuste', icon: '🔧', color: 'warning' },
  return: { name: 'Devolución', icon: '↩️', color: 'primary' },
  damage: { name: 'Daño/Merma', icon: '💔', color: 'danger' },
  transfer: { name: 'Transferencia', icon: '🔄', color: 'secondary' }
};

// Demo inventory movements
const demoMovements = [
  {
    id: 'mov-1',
    product_id: 'prod-1',
    product_name: 'Miel de Bosque Premium',
    movement_type: 'purchase',
    quantity: 50,
    previous_stock: 20,
    new_stock: 70,
    reference_type: 'manual',
    notes: 'Reposición de inventario',
    created_by_name: 'Admin',
    created_at: new Date(Date.now() - 86400000 * 2)
  },
  {
    id: 'mov-2',
    product_id: 'prod-1',
    product_name: 'Miel de Bosque Premium',
    movement_type: 'sale',
    quantity: -5,
    previous_stock: 70,
    new_stock: 65,
    reference_type: 'order',
    reference_id: 'order-123',
    created_at: new Date(Date.now() - 86400000)
  },
  {
    id: 'mov-3',
    product_id: 'prod-2',
    product_name: 'Miel de Flores Silvestres',
    movement_type: 'damage',
    quantity: -2,
    previous_stock: 35,
    new_stock: 33,
    reference_type: 'manual',
    notes: 'Frascos dañados en almacén',
    created_by_name: 'Admin',
    created_at: new Date(Date.now() - 43200000)
  }
];

/**
 * Get inventory summary
 */
export async function getInventorySummary() {
  if (isDemoMode) {
    return {
      total_products: 24,
      total_units: 847,
      total_value: 127350, // Cost price based
      retail_value: 185600, // Sale price based
      low_stock: 5,
      out_of_stock: 2,
      critical_stock: 3,
      overstock: 1,
      average_turnover: 4.2
    };
  }
  
  const [
    productsRes,
    lowStockRes,
    outOfStockRes,
    criticalRes
  ] = await Promise.all([
    supabaseAdmin.from('products').select('stock_quantity, price, cost_price, low_stock_threshold'),
    supabaseAdmin.from('products').select('*', { count: 'exact', head: true })
      .eq('is_active', true).lt('stock_quantity', 20).gt('stock_quantity', 0),
    supabaseAdmin.from('products').select('*', { count: 'exact', head: true })
      .eq('is_active', true).eq('stock_quantity', 0),
    supabaseAdmin.from('products').select('*', { count: 'exact', head: true })
      .eq('is_active', true).lt('stock_quantity', 5).gt('stock_quantity', 0)
  ]);
  
  const products = productsRes.data || [];
  
  let totalUnits = 0;
  let totalValue = 0;
  let retailValue = 0;
  
  for (const product of products) {
    totalUnits += product.stock_quantity || 0;
    totalValue += (product.cost_price || product.price * 0.6) * (product.stock_quantity || 0);
    retailValue += product.price * (product.stock_quantity || 0);
  }
  
  return {
    total_products: products.length,
    total_units: totalUnits,
    total_value: Math.round(totalValue * 100) / 100,
    retail_value: Math.round(retailValue * 100) / 100,
    low_stock: lowStockRes.count || 0,
    out_of_stock: outOfStockRes.count || 0,
    critical_stock: criticalRes.count || 0,
    overstock: 0,
    average_turnover: 0
  };
}

/**
 * Get products with low stock
 */
export async function getLowStockProducts(threshold = 20) {
  if (isDemoMode) {
    return [
      { id: 'p1', name: 'Propóleo Premium', stock_quantity: 3, low_stock_threshold: 10, image_url: '/assets/img/products/product-1.png' },
      { id: 'p2', name: 'Jalea Real', stock_quantity: 5, low_stock_threshold: 10, image_url: '/assets/img/products/product-2.png' },
      { id: 'p3', name: 'Miel de Lavanda', stock_quantity: 8, low_stock_threshold: 15, image_url: '/assets/img/products/product-3.png' }
    ];
  }
  
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, name, sku, stock_quantity, low_stock_threshold, image_url, price')
    .eq('is_active', true)
    .lt('stock_quantity', threshold)
    .order('stock_quantity');
  
  if (error) throw error;
  return data || [];
}

/**
 * Get out of stock products
 */
export async function getOutOfStockProducts() {
  if (isDemoMode) {
    return [
      { id: 'p4', name: 'Miel de Manuka', stock_quantity: 0, image_url: '/assets/img/products/product-4.png', last_sale_at: new Date(Date.now() - 86400000 * 3) }
    ];
  }
  
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, name, sku, stock_quantity, image_url, price')
    .eq('is_active', true)
    .eq('stock_quantity', 0)
    .order('name');
  
  if (error) throw error;
  return data || [];
}

/**
 * Get inventory movements
 */
export async function getInventoryMovements(filters = {}) {
  if (isDemoMode) {
    let movements = [...demoMovements];
    
    if (filters.product_id) {
      movements = movements.filter(m => m.product_id === filters.product_id);
    }
    if (filters.type) {
      movements = movements.filter(m => m.movement_type === filters.type);
    }
    
    return { data: movements, count: movements.length };
  }
  
  let query = supabaseAdmin
    .from('inventory_movements')
    .select(`
      *,
      products(name, sku, image_url),
      profiles(full_name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });
  
  if (filters.product_id) {
    query = query.eq('product_id', filters.product_id);
  }
  if (filters.type) {
    query = query.eq('movement_type', filters.type);
  }
  if (filters.from_date) {
    query = query.gte('created_at', filters.from_date);
  }
  if (filters.to_date) {
    query = query.lte('created_at', filters.to_date);
  }
  
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  query = query.range(offset, offset + limit - 1);
  
  const { data, error, count } = await query;
  if (error) throw error;
  
  return {
    data: (data || []).map(m => ({
      ...m,
      product_name: m.products?.name,
      created_by_name: m.profiles?.full_name
    })),
    count
  };
}

/**
 * Adjust stock for a product
 */
export async function adjustStock(productId, adjustment, options = {}) {
  const {
    type = 'adjustment',
    notes = '',
    referenceType = 'manual',
    referenceId = null,
    userId = null
  } = options;
  
  if (isDemoMode) {
    return { success: true, message: '(Demo) Stock adjusted', new_stock: 50 };
  }
  
  // Get current stock
  const { data: product, error: getError } = await supabaseAdmin
    .from('products')
    .select('stock_quantity, name, low_stock_threshold')
    .eq('id', productId)
    .single();
  
  if (getError || !product) {
    throw new Error('Product not found');
  }
  
  const previousStock = product.stock_quantity || 0;
  const newStock = Math.max(0, previousStock + adjustment);
  
  // Update product stock
  const { error: updateError } = await supabaseAdmin
    .from('products')
    .update({ stock_quantity: newStock })
    .eq('id', productId);
  
  if (updateError) throw updateError;
  
  // Record movement
  await supabaseAdmin
    .from('inventory_movements')
    .insert({
      product_id: productId,
      movement_type: type,
      quantity: adjustment,
      previous_stock: previousStock,
      new_stock: newStock,
      reference_type: referenceType,
      reference_id: referenceId,
      notes,
      created_by: userId
    });
  
  // Check for alerts
  if (newStock <= 0 && previousStock > 0) {
    await webhooksService.trigger('product.out_of_stock', {
      product_id: productId,
      product_name: product.name,
      previous_stock: previousStock
    });
  } else if (newStock <= (product.low_stock_threshold || 10) && previousStock > (product.low_stock_threshold || 10)) {
    await webhooksService.trigger('product.low_stock', {
      product_id: productId,
      product_name: product.name,
      current_stock: newStock,
      threshold: product.low_stock_threshold
    });
  } else if (previousStock <= 0 && newStock > 0) {
    await webhooksService.trigger('product.back_in_stock', {
      product_id: productId,
      product_name: product.name,
      new_stock: newStock
    });
  }
  
  return { success: true, previous_stock: previousStock, new_stock: newStock };
}

/**
 * Bulk stock adjustment
 */
export async function bulkAdjustStock(adjustments, options = {}) {
  const results = [];
  
  for (const adj of adjustments) {
    try {
      const result = await adjustStock(adj.product_id, adj.quantity, {
        type: adj.type || options.type || 'adjustment',
        notes: adj.notes || options.notes || 'Bulk adjustment',
        referenceType: 'bulk',
        userId: options.userId
      });
      results.push({ product_id: adj.product_id, success: true, ...result });
    } catch (error) {
      results.push({ product_id: adj.product_id, success: false, error: error.message });
    }
  }
  
  return results;
}

/**
 * Get stock alerts configuration
 */
export async function getStockAlerts() {
  if (isDemoMode) {
    return {
      low_stock_threshold: 20,
      critical_stock_threshold: 5,
      email_alerts: true,
      webhook_alerts: true,
      alert_recipients: ['admin@modhu.com']
    };
  }
  
  const { data } = await supabaseAdmin
    .from('store_settings')
    .select('value')
    .eq('key', 'inventory_alerts')
    .single();
  
  return data?.value || {
    low_stock_threshold: 20,
    critical_stock_threshold: 5,
    email_alerts: true,
    webhook_alerts: true,
    alert_recipients: []
  };
}

/**
 * Update stock alerts configuration
 */
export async function updateStockAlerts(config) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Alerts updated' };
  }
  
  await supabaseAdmin
    .from('store_settings')
    .upsert({
      key: 'inventory_alerts',
      value: config
    }, { onConflict: 'key' });
  
  return { success: true };
}

/**
 * Get inventory valuation report
 */
export async function getInventoryValuation() {
  if (isDemoMode) {
    return {
      by_category: [
        { category: 'Miel Pura', units: 234, cost_value: 35100, retail_value: 58500 },
        { category: 'Productos de Colmena', units: 156, cost_value: 23400, retail_value: 39000 },
        { category: 'Sets y Regalos', units: 45, cost_value: 11250, retail_value: 18750 }
      ],
      total: {
        units: 435,
        cost_value: 69750,
        retail_value: 116250,
        potential_profit: 46500
      }
    };
  }
  
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('stock_quantity, price, cost_price, category_id, categories(name)')
    .eq('is_active', true);
  
  if (!products) return { by_category: [], total: {} };
  
  const byCategory = {};
  let totalUnits = 0;
  let totalCostValue = 0;
  let totalRetailValue = 0;
  
  for (const product of products) {
    const categoryName = product.categories?.name || 'Sin categoría';
    const units = product.stock_quantity || 0;
    const costPrice = product.cost_price || product.price * 0.6;
    const retailPrice = product.price;
    
    if (!byCategory[categoryName]) {
      byCategory[categoryName] = { category: categoryName, units: 0, cost_value: 0, retail_value: 0 };
    }
    
    byCategory[categoryName].units += units;
    byCategory[categoryName].cost_value += costPrice * units;
    byCategory[categoryName].retail_value += retailPrice * units;
    
    totalUnits += units;
    totalCostValue += costPrice * units;
    totalRetailValue += retailPrice * units;
  }
  
  return {
    by_category: Object.values(byCategory).map(c => ({
      ...c,
      cost_value: Math.round(c.cost_value * 100) / 100,
      retail_value: Math.round(c.retail_value * 100) / 100
    })),
    total: {
      units: totalUnits,
      cost_value: Math.round(totalCostValue * 100) / 100,
      retail_value: Math.round(totalRetailValue * 100) / 100,
      potential_profit: Math.round((totalRetailValue - totalCostValue) * 100) / 100
    }
  };
}

/**
 * Get stock projection (when will products run out)
 */
export async function getStockProjection(days = 30) {
  if (isDemoMode) {
    return [
      { product_id: 'p1', name: 'Propóleo Premium', current_stock: 8, avg_daily_sales: 1.2, days_until_stockout: 7 },
      { product_id: 'p2', name: 'Miel de Lavanda', current_stock: 12, avg_daily_sales: 0.8, days_until_stockout: 15 }
    ];
  }
  
  // Get recent sales velocity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  
  const { data: salesData } = await supabaseAdmin
    .from('order_items')
    .select('product_id, quantity, orders!inner(created_at, payment_status)')
    .eq('orders.payment_status', 'paid')
    .gte('orders.created_at', thirtyDaysAgo);
  
  if (!salesData) return [];
  
  // Calculate sales per product
  const salesByProduct = {};
  for (const sale of salesData) {
    if (!salesByProduct[sale.product_id]) {
      salesByProduct[sale.product_id] = 0;
    }
    salesByProduct[sale.product_id] += sale.quantity;
  }
  
  // Get products and calculate projections
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, name, stock_quantity')
    .eq('is_active', true)
    .gt('stock_quantity', 0);
  
  const projections = [];
  
  for (const product of products || []) {
    const totalSales = salesByProduct[product.id] || 0;
    const avgDailySales = totalSales / 30;
    
    if (avgDailySales > 0) {
      const daysUntilStockout = Math.floor(product.stock_quantity / avgDailySales);
      
      if (daysUntilStockout <= days) {
        projections.push({
          product_id: product.id,
          name: product.name,
          current_stock: product.stock_quantity,
          avg_daily_sales: Math.round(avgDailySales * 100) / 100,
          days_until_stockout: daysUntilStockout
        });
      }
    }
  }
  
  return projections.sort((a, b) => a.days_until_stockout - b.days_until_stockout);
}

/**
 * Get slow moving products
 */
export async function getSlowMovingProducts(days = 90) {
  if (isDemoMode) {
    return [
      { id: 'p5', name: 'Set Regalo Premium', stock_quantity: 15, last_sale_at: new Date(Date.now() - 86400000 * 95), days_since_sale: 95 }
    ];
  }
  
  const cutoffDate = new Date(Date.now() - days * 86400000).toISOString();
  
  // Get products that haven't sold recently
  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id, name, stock_quantity, image_url')
    .eq('is_active', true)
    .gt('stock_quantity', 0);
  
  const { data: recentSales } = await supabaseAdmin
    .from('order_items')
    .select('product_id, orders!inner(created_at)')
    .gte('orders.created_at', cutoffDate);
  
  const productsWithRecentSales = new Set(recentSales?.map(s => s.product_id) || []);
  
  const slowMoving = (products || [])
    .filter(p => !productsWithRecentSales.has(p.id))
    .map(p => ({
      ...p,
      days_since_sale: days // Approximate
    }));
  
  return slowMoving;
}

export default {
  MOVEMENT_TYPES,
  getInventorySummary,
  getLowStockProducts,
  getOutOfStockProducts,
  getInventoryMovements,
  adjustStock,
  bulkAdjustStock,
  getStockAlerts,
  updateStockAlerts,
  getInventoryValuation,
  getStockProjection,
  getSlowMovingProducts
};
