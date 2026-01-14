/**
 * Promotions Service
 * Handles advanced promotion management: flash sales, bundles, BOGO, tiered discounts
 */
import { supabaseAdmin, isDemoMode } from '../config/supabase.js';

// Promotion types
export const PROMOTION_TYPES = {
  flash_sale: {
    name: 'Flash Sale',
    description: 'Venta relámpago con temporizador',
    icon: '🔥'
  },
  bundle: {
    name: 'Bundle/Combo',
    description: 'Paquetes de productos con descuento',
    icon: '🎁'
  },
  bogo: {
    name: 'BOGO',
    description: 'Buy One Get One (2x1, 3x2, etc)',
    icon: '🎉'
  },
  tiered: {
    name: 'Descuento por Volumen',
    description: 'Descuento escalonado por cantidad',
    icon: '📊'
  },
  seasonal: {
    name: 'Temporada',
    description: 'Promociones de temporada',
    icon: '🎄'
  },
  first_purchase: {
    name: 'Primera Compra',
    description: 'Descuento para nuevos clientes',
    icon: '⭐'
  },
  loyalty: {
    name: 'Lealtad',
    description: 'Recompensas para clientes recurrentes',
    icon: '💎'
  },
  cart_value: {
    name: 'Valor de Carrito',
    description: 'Descuento por monto de compra',
    icon: '🛒'
  }
};

// Demo promotions
const demoPromotions = [
  {
    id: 'promo-1',
    name: 'Flash Sale Fin de Semana',
    type: 'flash_sale',
    discount_type: 'percentage',
    discount_value: 20,
    min_quantity: null,
    min_cart_value: null,
    required_products: [],
    eligible_products: [],
    eligible_categories: [],
    max_uses: 100,
    max_uses_per_customer: 1,
    current_uses: 47,
    starts_at: new Date(Date.now() - 86400000),
    ends_at: new Date(Date.now() + 86400000 * 2),
    days_of_week: [6, 0], // Sat, Sun
    hours_active: null,
    is_active: true,
    priority: 10,
    stackable: false,
    banner_image: '/assets/img/promos/flash-sale.jpg',
    badge_text: '🔥 Flash Sale',
    landing_url: '/shop?promo=flash-sale',
    created_at: new Date()
  },
  {
    id: 'promo-2',
    name: 'Combo Degustación',
    type: 'bundle',
    discount_type: 'fixed',
    discount_value: 99,
    bundle_products: ['prod-1', 'prod-2', 'prod-3'],
    bundle_price: 450,
    max_uses: null,
    max_uses_per_customer: null,
    current_uses: 23,
    starts_at: new Date(Date.now() - 86400000 * 30),
    ends_at: null, // No expiration
    is_active: true,
    priority: 5,
    stackable: false,
    badge_text: '🎁 Pack Ahorro',
    created_at: new Date()
  },
  {
    id: 'promo-3',
    name: '3x2 en Miel de Flores',
    type: 'bogo',
    buy_quantity: 3,
    get_quantity: 1,
    discount_type: 'percentage',
    discount_value: 100, // Free item
    eligible_products: ['prod-4', 'prod-5'],
    max_uses: 50,
    current_uses: 12,
    starts_at: new Date(),
    ends_at: new Date(Date.now() + 86400000 * 14),
    is_active: true,
    priority: 8,
    badge_text: '🎉 3x2',
    created_at: new Date()
  },
  {
    id: 'promo-4',
    name: 'Descuento por Volumen',
    type: 'tiered',
    tiers: [
      { min_quantity: 3, discount: 5 },
      { min_quantity: 6, discount: 10 },
      { min_quantity: 12, discount: 15 }
    ],
    eligible_categories: ['cat-1'],
    is_active: true,
    priority: 3,
    badge_text: '💰 Más es Menos',
    created_at: new Date()
  }
];

/**
 * Get all promotions
 */
export async function getPromotions(filters = {}) {
  if (isDemoMode) {
    let promos = [...demoPromotions];
    
    if (filters.active === true) {
      promos = promos.filter(p => p.is_active);
    }
    if (filters.type) {
      promos = promos.filter(p => p.type === filters.type);
    }
    if (filters.status === 'scheduled') {
      promos = promos.filter(p => new Date(p.starts_at) > new Date());
    } else if (filters.status === 'ended') {
      promos = promos.filter(p => p.ends_at && new Date(p.ends_at) < new Date());
    }
    
    return { data: promos, count: promos.length };
  }
  
  let query = supabaseAdmin
    .from('promotions')
    .select('*', { count: 'exact' })
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  
  if (filters.active !== undefined) {
    query = query.eq('is_active', filters.active);
  }
  if (filters.type) {
    query = query.eq('type', filters.type);
  }
  
  const { data, error, count } = await query;
  if (error) throw error;
  
  return { data: data || [], count };
}

/**
 * Get promotion by ID
 */
export async function getPromotionById(id) {
  if (isDemoMode) {
    return demoPromotions.find(p => p.id === id) || null;
  }
  
  const { data, error } = await supabaseAdmin
    .from('promotions')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data;
}

/**
 * Create a new promotion
 */
export async function createPromotion(promoData) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Promotion created' };
  }
  
  const { data, error } = await supabaseAdmin
    .from('promotions')
    .insert({
      name: promoData.name,
      type: promoData.type,
      discount_type: promoData.discount_type,
      discount_value: parseFloat(promoData.discount_value) || 0,
      min_quantity: promoData.min_quantity ? parseInt(promoData.min_quantity) : null,
      min_cart_value: promoData.min_cart_value ? parseFloat(promoData.min_cart_value) : null,
      required_products: promoData.required_products || [],
      eligible_products: promoData.eligible_products || [],
      eligible_categories: promoData.eligible_categories || [],
      max_uses: promoData.max_uses ? parseInt(promoData.max_uses) : null,
      max_uses_per_customer: promoData.max_uses_per_customer ? parseInt(promoData.max_uses_per_customer) : null,
      starts_at: promoData.starts_at || new Date().toISOString(),
      ends_at: promoData.ends_at || null,
      days_of_week: promoData.days_of_week || null,
      hours_active: promoData.hours_active || null,
      is_active: promoData.is_active !== false,
      priority: parseInt(promoData.priority) || 0,
      stackable: promoData.stackable === true,
      banner_image: promoData.banner_image || null,
      badge_text: promoData.badge_text || null,
      landing_url: promoData.landing_url || null,
      config: promoData.config || {} // Extra config for specific types
    })
    .select()
    .single();
  
  if (error) throw error;
  return { success: true, data };
}

/**
 * Update a promotion
 */
export async function updatePromotion(id, promoData) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Promotion updated' };
  }
  
  const { error } = await supabaseAdmin
    .from('promotions')
    .update(promoData)
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}

/**
 * Delete a promotion
 */
export async function deletePromotion(id) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Promotion deleted' };
  }
  
  const { error } = await supabaseAdmin
    .from('promotions')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}

/**
 * Get active promotions for storefront
 */
export async function getActivePromotions() {
  const now = new Date();
  
  if (isDemoMode) {
    return demoPromotions.filter(p => {
      if (!p.is_active) return false;
      if (new Date(p.starts_at) > now) return false;
      if (p.ends_at && new Date(p.ends_at) < now) return false;
      if (p.max_uses && p.current_uses >= p.max_uses) return false;
      return true;
    });
  }
  
  const { data, error } = await supabaseAdmin
    .from('promotions')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', now.toISOString())
    .or(`ends_at.is.null,ends_at.gte.${now.toISOString()}`)
    .order('priority', { ascending: false });
  
  if (error) throw error;
  
  // Filter out depleted promotions
  return (data || []).filter(p => !p.max_uses || p.current_uses < p.max_uses);
}

/**
 * Check if promotion applies to cart
 */
export function checkPromotionApplicability(promotion, cart, customer = null) {
  const now = new Date();
  const result = {
    applicable: false,
    discount: 0,
    message: '',
    badge: promotion.badge_text
  };
  
  // Check dates
  if (new Date(promotion.starts_at) > now) {
    result.message = 'Promoción aún no inicia';
    return result;
  }
  
  if (promotion.ends_at && new Date(promotion.ends_at) < now) {
    result.message = 'Promoción expirada';
    return result;
  }
  
  // Check days of week
  if (promotion.days_of_week && promotion.days_of_week.length > 0) {
    const today = now.getDay();
    if (!promotion.days_of_week.includes(today)) {
      result.message = 'Promoción no válida hoy';
      return result;
    }
  }
  
  // Check usage limits
  if (promotion.max_uses && promotion.current_uses >= promotion.max_uses) {
    result.message = 'Promoción agotada';
    return result;
  }
  
  // Check first purchase requirement
  if (promotion.type === 'first_purchase') {
    if (customer && customer.total_orders > 0) {
      result.message = 'Solo para primera compra';
      return result;
    }
  }
  
  // Check loyalty requirement
  if (promotion.type === 'loyalty') {
    if (!customer || customer.total_orders < (promotion.config?.min_orders || 1)) {
      result.message = 'Requiere compras previas';
      return result;
    }
  }
  
  // Calculate discount based on type
  switch (promotion.type) {
    case 'flash_sale':
    case 'seasonal':
      result.discount = calculateFlashSaleDiscount(promotion, cart);
      break;
      
    case 'bundle':
      result.discount = calculateBundleDiscount(promotion, cart);
      break;
      
    case 'bogo':
      result.discount = calculateBogoDiscount(promotion, cart);
      break;
      
    case 'tiered':
      result.discount = calculateTieredDiscount(promotion, cart);
      break;
      
    case 'cart_value':
      result.discount = calculateCartValueDiscount(promotion, cart);
      break;
      
    case 'first_purchase':
    case 'loyalty':
      result.discount = calculateSimpleDiscount(promotion, cart);
      break;
      
    default:
      result.discount = 0;
  }
  
  if (result.discount > 0) {
    result.applicable = true;
    result.message = promotion.badge_text || 'Descuento aplicado';
  } else {
    result.message = 'No aplica a tu carrito';
  }
  
  return result;
}

/**
 * Calculate flash sale discount
 */
function calculateFlashSaleDiscount(promotion, cart) {
  let eligibleSubtotal = 0;
  
  for (const item of cart.items) {
    const isEligible = isProductEligible(item.product_id, item.category_id, promotion);
    if (isEligible) {
      eligibleSubtotal += item.price * item.quantity;
    }
  }
  
  if (promotion.discount_type === 'percentage') {
    return (eligibleSubtotal * promotion.discount_value) / 100;
  } else {
    return Math.min(promotion.discount_value, eligibleSubtotal);
  }
}

/**
 * Calculate bundle discount
 */
function calculateBundleDiscount(promotion, cart) {
  const bundleProducts = promotion.config?.bundle_products || [];
  const bundlePrice = promotion.config?.bundle_price || 0;
  
  if (bundleProducts.length === 0) return 0;
  
  // Check if all bundle products are in cart
  const hasAllProducts = bundleProducts.every(productId => 
    cart.items.some(item => item.product_id === productId)
  );
  
  if (!hasAllProducts) return 0;
  
  // Calculate original price of bundle items
  const originalPrice = cart.items
    .filter(item => bundleProducts.includes(item.product_id))
    .reduce((sum, item) => sum + item.price, 0);
  
  return Math.max(0, originalPrice - bundlePrice);
}

/**
 * Calculate BOGO discount
 */
function calculateBogoDiscount(promotion, cart) {
  const buyQty = promotion.config?.buy_quantity || 2;
  const getQty = promotion.config?.get_quantity || 1;
  
  let eligibleQuantity = 0;
  let lowestPrice = Infinity;
  
  for (const item of cart.items) {
    const isEligible = isProductEligible(item.product_id, item.category_id, promotion);
    if (isEligible) {
      eligibleQuantity += item.quantity;
      if (item.price < lowestPrice) {
        lowestPrice = item.price;
      }
    }
  }
  
  // Calculate how many free items
  const sets = Math.floor(eligibleQuantity / buyQty);
  const freeItems = sets * getQty;
  
  if (freeItems === 0 || lowestPrice === Infinity) return 0;
  
  // Discount is the value of free items (usually 100% of their price)
  const discountPercentage = promotion.discount_value / 100;
  return lowestPrice * freeItems * discountPercentage;
}

/**
 * Calculate tiered discount
 */
function calculateTieredDiscount(promotion, cart) {
  const tiers = promotion.config?.tiers || [];
  if (tiers.length === 0) return 0;
  
  let eligibleQuantity = 0;
  let eligibleSubtotal = 0;
  
  for (const item of cart.items) {
    const isEligible = isProductEligible(item.product_id, item.category_id, promotion);
    if (isEligible) {
      eligibleQuantity += item.quantity;
      eligibleSubtotal += item.price * item.quantity;
    }
  }
  
  // Find applicable tier
  let applicableTier = null;
  for (const tier of tiers.sort((a, b) => b.min_quantity - a.min_quantity)) {
    if (eligibleQuantity >= tier.min_quantity) {
      applicableTier = tier;
      break;
    }
  }
  
  if (!applicableTier) return 0;
  
  return (eligibleSubtotal * applicableTier.discount) / 100;
}

/**
 * Calculate cart value discount
 */
function calculateCartValueDiscount(promotion, cart) {
  const minCartValue = promotion.min_cart_value || 0;
  
  if (cart.subtotal < minCartValue) return 0;
  
  if (promotion.discount_type === 'percentage') {
    return (cart.subtotal * promotion.discount_value) / 100;
  } else {
    return promotion.discount_value;
  }
}

/**
 * Calculate simple percentage/fixed discount
 */
function calculateSimpleDiscount(promotion, cart) {
  if (promotion.discount_type === 'percentage') {
    let discount = (cart.subtotal * promotion.discount_value) / 100;
    if (promotion.config?.maximum_discount) {
      discount = Math.min(discount, promotion.config.maximum_discount);
    }
    return discount;
  } else {
    return Math.min(promotion.discount_value, cart.subtotal);
  }
}

/**
 * Check if a product is eligible for a promotion
 */
function isProductEligible(productId, categoryId, promotion) {
  // If no restrictions, all products eligible
  if (
    (!promotion.eligible_products || promotion.eligible_products.length === 0) &&
    (!promotion.eligible_categories || promotion.eligible_categories.length === 0)
  ) {
    return true;
  }
  
  // Check product list
  if (promotion.eligible_products && promotion.eligible_products.includes(productId)) {
    return true;
  }
  
  // Check category list
  if (promotion.eligible_categories && promotion.eligible_categories.includes(categoryId)) {
    return true;
  }
  
  return false;
}

/**
 * Get best applicable promotion for a cart
 */
export async function getBestPromotion(cart, customer = null) {
  const activePromotions = await getActivePromotions();
  
  let bestPromotion = null;
  let bestDiscount = 0;
  
  for (const promo of activePromotions) {
    const result = checkPromotionApplicability(promo, cart, customer);
    
    if (result.applicable && result.discount > bestDiscount) {
      bestDiscount = result.discount;
      bestPromotion = {
        ...promo,
        calculated_discount: result.discount,
        message: result.message
      };
    }
  }
  
  return bestPromotion;
}

/**
 * Record promotion usage
 */
export async function recordPromotionUsage(promotionId, orderId, userId, discountApplied) {
  if (isDemoMode) {
    const promo = demoPromotions.find(p => p.id === promotionId);
    if (promo) promo.current_uses++;
    return;
  }
  
  // Record usage
  await supabaseAdmin
    .from('promotion_usages')
    .insert({
      promotion_id: promotionId,
      order_id: orderId,
      user_id: userId,
      discount_applied: discountApplied
    });
  
  // Increment counter
  await supabaseAdmin.rpc('increment_promotion_usage', { p_id: promotionId });
}

/**
 * Get promotion statistics
 */
export async function getPromotionStats(promotionId) {
  if (isDemoMode) {
    const promo = demoPromotions.find(p => p.id === promotionId);
    if (!promo) return null;
    
    return {
      total_uses: promo.current_uses,
      total_discount_given: promo.current_uses * (promo.discount_value || 50),
      total_revenue_generated: promo.current_uses * 450,
      average_order_value: 450,
      conversion_rate: 3.2
    };
  }
  
  const { data, error } = await supabaseAdmin
    .from('promotion_usages')
    .select('discount_applied, orders(total)')
    .eq('promotion_id', promotionId);
  
  if (error) throw error;
  
  const stats = {
    total_uses: data.length,
    total_discount_given: data.reduce((sum, u) => sum + parseFloat(u.discount_applied), 0),
    total_revenue_generated: data.reduce((sum, u) => sum + parseFloat(u.orders?.total || 0), 0),
    average_order_value: 0,
    conversion_rate: 0 // Would need more data to calculate
  };
  
  if (stats.total_uses > 0) {
    stats.average_order_value = stats.total_revenue_generated / stats.total_uses;
  }
  
  return stats;
}

export default {
  PROMOTION_TYPES,
  getPromotions,
  getPromotionById,
  createPromotion,
  updatePromotion,
  deletePromotion,
  getActivePromotions,
  checkPromotionApplicability,
  getBestPromotion,
  recordPromotionUsage,
  getPromotionStats
};
