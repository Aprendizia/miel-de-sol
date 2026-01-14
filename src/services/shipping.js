/**
 * Shipping Service - Manage shipping zones and rates
 */
import { supabaseAdmin, isDemoMode } from '../config/supabase.js';

// Demo shipping data
const demoZones = [
  {
    id: '1',
    name: 'CDMX y Área Metropolitana',
    states: ['Ciudad de México', 'Estado de México'],
    is_active: true,
    rates: [
      { id: '1', name: 'Estándar', price: 79, estimated_days: '2-3 días', free_threshold: 400 },
      { id: '2', name: 'Express', price: 129, estimated_days: '1 día', free_threshold: 800 }
    ]
  },
  {
    id: '2',
    name: 'Nacional',
    states: ['Aguascalientes', 'Baja California', 'Jalisco', 'Nuevo León', 'Veracruz'],
    is_active: true,
    rates: [
      { id: '3', name: 'Estándar', price: 99, estimated_days: '5-7 días', free_threshold: 500 },
      { id: '4', name: 'Express', price: 179, estimated_days: '2-3 días', free_threshold: 1000 }
    ]
  }
];

/**
 * Get all shipping zones with rates
 */
export async function getShippingZones() {
  if (isDemoMode) {
    return demoZones;
  }

  const { data: zones, error } = await supabaseAdmin
    .from('shipping_zones')
    .select('*')
    .order('name');

  if (error) throw error;

  // Get rates for each zone
  for (const zone of zones) {
    const { data: rates } = await supabaseAdmin
      .from('shipping_rates')
      .select('*')
      .eq('zone_id', zone.id)
      .eq('is_active', true)
      .order('sort_order');
    
    zone.rates = rates || [];
  }

  return zones || [];
}

/**
 * Get shipping rates for a postal code/state
 */
export async function getShippingRatesForLocation(state, postalCode = null) {
  if (isDemoMode) {
    // Check CDMX zone first
    if (['Ciudad de México', 'Estado de México', 'CDMX'].includes(state)) {
      return demoZones[0].rates;
    }
    // Return national rates
    return demoZones[1].rates;
  }

  // Find zone by state
  const { data: zones, error } = await supabaseAdmin
    .from('shipping_zones')
    .select('id, name')
    .eq('is_active', true)
    .contains('states', [state]);

  if (error || !zones || zones.length === 0) {
    // Return default rates
    const { data: defaultRates } = await supabaseAdmin
      .from('shipping_rates')
      .select('*')
      .is('zone_id', null)
      .eq('is_active', true)
      .order('price');
    
    return defaultRates || [];
  }

  // Get rates for the zone
  const { data: rates } = await supabaseAdmin
    .from('shipping_rates')
    .select('*')
    .eq('zone_id', zones[0].id)
    .eq('is_active', true)
    .order('sort_order');

  return rates || [];
}

/**
 * Calculate shipping cost
 */
export function calculateShipping(rate, subtotal, weight = 0) {
  if (!rate) return 0;

  // Check free shipping threshold
  if (rate.free_shipping_threshold && subtotal >= rate.free_shipping_threshold) {
    return 0;
  }

  // Check weight limits
  if (rate.max_weight && weight > rate.max_weight) {
    return null; // Not eligible for this rate
  }

  return parseFloat(rate.price);
}

/**
 * Create shipping zone
 */
export async function createShippingZone(zoneData) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Zona creada' };
  }

  const { data, error } = await supabaseAdmin
    .from('shipping_zones')
    .insert({
      name: zoneData.name,
      states: zoneData.states || [],
      postal_codes: zoneData.postal_codes || [],
      is_active: zoneData.is_active !== false
    })
    .select()
    .single();

  if (error) throw error;
  return { success: true, data };
}

/**
 * Create shipping rate
 */
export async function createShippingRate(rateData) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Tarifa creada' };
  }

  const { data, error } = await supabaseAdmin
    .from('shipping_rates')
    .insert({
      zone_id: rateData.zone_id,
      name: rateData.name,
      description: rateData.description,
      price: parseFloat(rateData.price),
      free_shipping_threshold: rateData.free_threshold ? parseFloat(rateData.free_threshold) : null,
      estimated_days: rateData.estimated_days,
      is_active: rateData.is_active !== false,
      sort_order: parseInt(rateData.sort_order) || 0
    })
    .select()
    .single();

  if (error) throw error;
  return { success: true, data };
}

/**
 * Update shipping zone
 */
export async function updateShippingZone(id, zoneData) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Zona actualizada' };
  }

  const { error } = await supabaseAdmin
    .from('shipping_zones')
    .update({
      name: zoneData.name,
      states: zoneData.states || [],
      is_active: zoneData.is_active
    })
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

/**
 * Update shipping rate
 */
export async function updateShippingRate(id, rateData) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Tarifa actualizada' };
  }

  const { error } = await supabaseAdmin
    .from('shipping_rates')
    .update({
      name: rateData.name,
      description: rateData.description,
      price: parseFloat(rateData.price),
      free_shipping_threshold: rateData.free_threshold ? parseFloat(rateData.free_threshold) : null,
      estimated_days: rateData.estimated_days,
      is_active: rateData.is_active
    })
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

/**
 * Delete shipping zone
 */
export async function deleteShippingZone(id) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Zona eliminada' };
  }

  const { error } = await supabaseAdmin
    .from('shipping_zones')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

/**
 * Delete shipping rate
 */
export async function deleteShippingRate(id) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Tarifa eliminada' };
  }

  const { error } = await supabaseAdmin
    .from('shipping_rates')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

// Mexican states list
export const mexicanStates = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche',
  'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima',
  'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo',
  'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca',
  'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa',
  'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'
];

export default {
  getShippingZones,
  getShippingRatesForLocation,
  calculateShipping,
  createShippingZone,
  createShippingRate,
  updateShippingZone,
  updateShippingRate,
  deleteShippingZone,
  deleteShippingRate,
  mexicanStates
};
