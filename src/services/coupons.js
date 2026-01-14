/**
 * Coupon Service - Manage discount coupons
 */
import { supabaseAdmin, isDemoMode } from '../config/supabase.js';

// Demo coupons data
const demoCoupons = [
  {
    id: '1',
    code: 'BIENVENIDO10',
    description: '10% de descuento en tu primera compra',
    discount_type: 'percentage',
    discount_value: 10,
    minimum_amount: 200,
    maximum_discount: 100,
    usage_limit: null,
    used_count: 15,
    valid_from: new Date('2024-01-01'),
    valid_until: new Date('2026-12-31'),
    is_active: true
  },
  {
    id: '2',
    code: 'ENVIOGRATIS',
    description: 'Envío gratis en compras mayores a $300',
    discount_type: 'free_shipping',
    discount_value: 0,
    minimum_amount: 300,
    usage_limit: 100,
    used_count: 45,
    valid_from: new Date('2024-01-01'),
    valid_until: new Date('2026-06-30'),
    is_active: true
  },
  {
    id: '3',
    code: 'DESCUENTO50',
    description: '$50 de descuento directo',
    discount_type: 'fixed',
    discount_value: 50,
    minimum_amount: 400,
    usage_limit: 50,
    used_count: 50,
    valid_from: new Date('2024-01-01'),
    valid_until: new Date('2024-12-31'),
    is_active: false
  }
];

/**
 * Get all coupons
 */
export async function getCoupons(filters = {}) {
  if (isDemoMode) {
    let coupons = [...demoCoupons];
    if (filters.active === true) {
      coupons = coupons.filter(c => c.is_active);
    }
    return { data: coupons, count: coupons.length };
  }

  let query = supabaseAdmin
    .from('coupons')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.active !== undefined) {
    query = query.eq('is_active', filters.active);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { data: data || [], count };
}

/**
 * Get coupon by ID
 */
export async function getCouponById(id) {
  if (isDemoMode) {
    return demoCoupons.find(c => c.id === id) || null;
  }

  const { data, error } = await supabaseAdmin
    .from('coupons')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

/**
 * Validate coupon code
 */
export async function validateCoupon(code, userId = null, subtotal = 0) {
  if (isDemoMode) {
    const coupon = demoCoupons.find(c => c.code.toUpperCase() === code.toUpperCase());
    
    if (!coupon) {
      return { valid: false, message: 'Cupón no válido' };
    }
    
    if (!coupon.is_active) {
      return { valid: false, message: 'Cupón inactivo' };
    }
    
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      return { valid: false, message: 'Cupón expirado' };
    }
    
    if (subtotal < coupon.minimum_amount) {
      return { valid: false, message: `Mínimo de compra: $${coupon.minimum_amount}` };
    }
    
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      return { valid: false, message: 'Cupón agotado' };
    }
    
    return {
      valid: true,
      coupon,
      discount: calculateDiscount(coupon, subtotal),
      message: 'Cupón aplicado'
    };
  }

  // Use Supabase function
  const { data, error } = await supabaseAdmin.rpc('validate_coupon', {
    p_code: code.toUpperCase(),
    p_user_id: userId,
    p_subtotal: subtotal
  });

  if (error || !data || !data[0]) {
    return { valid: false, message: 'Error validando cupón' };
  }

  const result = data[0];
  
  if (!result.valid) {
    return { valid: false, message: result.message };
  }

  // Get full coupon data
  const coupon = await getCouponById(result.coupon_id);
  
  return {
    valid: true,
    coupon,
    discount: calculateDiscount(coupon, subtotal),
    message: result.message
  };
}

/**
 * Calculate discount amount
 */
export function calculateDiscount(coupon, subtotal) {
  if (!coupon) return 0;

  switch (coupon.discount_type) {
    case 'percentage':
      let discount = (subtotal * coupon.discount_value) / 100;
      if (coupon.maximum_discount) {
        discount = Math.min(discount, coupon.maximum_discount);
      }
      return Math.round(discount * 100) / 100;
    
    case 'fixed':
      return Math.min(coupon.discount_value, subtotal);
    
    case 'free_shipping':
      return 0; // Shipping is handled separately
    
    default:
      return 0;
  }
}

/**
 * Create coupon
 */
export async function createCoupon(couponData) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Cupón creado' };
  }

  const { data, error } = await supabaseAdmin
    .from('coupons')
    .insert({
      code: couponData.code.toUpperCase(),
      description: couponData.description,
      discount_type: couponData.discount_type,
      discount_value: parseFloat(couponData.discount_value) || 0,
      minimum_amount: parseFloat(couponData.minimum_amount) || 0,
      maximum_discount: couponData.maximum_discount ? parseFloat(couponData.maximum_discount) : null,
      usage_limit: couponData.usage_limit ? parseInt(couponData.usage_limit) : null,
      usage_per_user: parseInt(couponData.usage_per_user) || 1,
      valid_from: couponData.valid_from || new Date().toISOString(),
      valid_until: couponData.valid_until || null,
      is_active: couponData.is_active !== false
    })
    .select()
    .single();

  if (error) throw error;
  return { success: true, data };
}

/**
 * Update coupon
 */
export async function updateCoupon(id, couponData) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Cupón actualizado' };
  }

  const { error } = await supabaseAdmin
    .from('coupons')
    .update({
      description: couponData.description,
      discount_type: couponData.discount_type,
      discount_value: parseFloat(couponData.discount_value) || 0,
      minimum_amount: parseFloat(couponData.minimum_amount) || 0,
      maximum_discount: couponData.maximum_discount ? parseFloat(couponData.maximum_discount) : null,
      usage_limit: couponData.usage_limit ? parseInt(couponData.usage_limit) : null,
      valid_until: couponData.valid_until || null,
      is_active: couponData.is_active
    })
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

/**
 * Delete coupon
 */
export async function deleteCoupon(id) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Cupón eliminado' };
  }

  const { error } = await supabaseAdmin
    .from('coupons')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

/**
 * Record coupon usage
 */
export async function recordCouponUsage(couponId, userId, orderId, discountApplied) {
  if (isDemoMode) return;

  await supabaseAdmin.from('coupon_usages').insert({
    coupon_id: couponId,
    user_id: userId,
    order_id: orderId,
    discount_applied: discountApplied
  });

  // Increment used_count
  await supabaseAdmin.rpc('increment', {
    table_name: 'coupons',
    row_id: couponId,
    column_name: 'used_count'
  });
}

export default {
  getCoupons,
  getCouponById,
  validateCoupon,
  calculateDiscount,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  recordCouponUsage
};
