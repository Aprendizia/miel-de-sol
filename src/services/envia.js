/**
 * Envia.com API Service
 * Integración con la API de envíos de Envia.com
 * Documentación: https://docs.envia.com/reference/quote-shipments
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ENVIA_API_KEY = process.env.ENVIA_API_KEY;
const ENVIA_API_URL = process.env.ENVIA_API_URL || 'https://api.envia.com';

// Configuración de origen (tu bodega/tienda)
const ORIGIN_CONFIG = {
  name: process.env.ENVIA_ORIGIN_NAME || 'Modhu Honey Store',
  company: process.env.ENVIA_ORIGIN_COMPANY || 'Modhu',
  email: process.env.ENVIA_ORIGIN_EMAIL || 'envios@modhu.mx',
  phone: process.env.ENVIA_ORIGIN_PHONE || '5551234567',
  street: process.env.ENVIA_ORIGIN_STREET || 'Calle Principal 123',
  city: process.env.ENVIA_ORIGIN_CITY || 'Xalapa',
  state: process.env.ENVIA_ORIGIN_STATE || 'VE', // Código ISO
  country: 'MX',
  postalCode: process.env.ENVIA_ORIGIN_POSTAL_CODE || '91000'
};

// Carriers soportados (se pueden configurar cuáles usar)
const SUPPORTED_CARRIERS = [
  'estafeta',
  'fedex', 
  'dhl',
  'redpack',
  'paquetexpress',
  '99minutos'
];

// Mapeo de estados mexicanos a códigos ISO 3166-2 (2 caracteres para Envia.com)
const MEXICO_STATES_MAP = {
  // Nombres completos
  'aguascalientes': 'AG',
  'baja california': 'BC',
  'baja california sur': 'BS',
  'campeche': 'CM',
  'chiapas': 'CS',
  'chihuahua': 'CH',
  'coahuila': 'CO',
  'colima': 'CL',
  'ciudad de mexico': 'DF',
  'ciudad de méxico': 'DF',
  'cdmx': 'DF',
  'df': 'DF',
  'distrito federal': 'DF',
  'durango': 'DG',
  'guanajuato': 'GT',
  'guerrero': 'GR',
  'hidalgo': 'HG',
  'jalisco': 'JA',
  'estado de mexico': 'EM',
  'estado de méxico': 'EM',
  'mexico': 'EM',
  'méxico': 'EM',
  'michoacan': 'MI',
  'michoacán': 'MI',
  'morelos': 'MO',
  'nayarit': 'NA',
  'nuevo leon': 'NL',
  'nuevo león': 'NL',
  'oaxaca': 'OA',
  'puebla': 'PU',
  'queretaro': 'QT',
  'querétaro': 'QT',
  'quintana roo': 'QR',
  'san luis potosi': 'SL',
  'san luis potosí': 'SL',
  'sinaloa': 'SI',
  'sonora': 'SO',
  'tabasco': 'TB',
  'tamaulipas': 'TM',
  'tlaxcala': 'TL',
  'veracruz': 'VE',
  'yucatan': 'YU',
  'yucatán': 'YU',
  'zacatecas': 'ZA'
};

/**
 * Normaliza el código de estado a formato ISO de 2 caracteres
 * @param {string} state - Nombre o código de estado
 * @returns {string} Código ISO de 2 caracteres
 */
function normalizeStateCode(state) {
  if (!state) return '';
  
  const normalized = state.toLowerCase().trim();
  
  // Si ya es un código de 2 caracteres válido, usarlo
  if (normalized.length === 2) {
    const upperState = normalized.toUpperCase();
    // Verificar si es un código válido
    const validCodes = Object.values(MEXICO_STATES_MAP);
    if (validCodes.includes(upperState)) {
      return upperState;
    }
  }
  
  // Buscar en el mapeo
  if (MEXICO_STATES_MAP[normalized]) {
    return MEXICO_STATES_MAP[normalized];
  }
  
  // Si no se encuentra, devolver los primeros 2 caracteres en mayúsculas
  console.warn(`⚠️ Estado no reconocido: "${state}", usando primeros 2 caracteres`);
  return state.substring(0, 2).toUpperCase();
}

// Verificar si Envia está configurado
export const isEnviaConfigured = !!ENVIA_API_KEY;

// Cliente HTTP con autenticación
const enviaClient = axios.create({
  baseURL: ENVIA_API_URL,
  headers: {
    'Authorization': `Bearer ${ENVIA_API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 30000 // 30 segundos timeout
});

/**
 * Obtener cotizaciones de envío de múltiples carriers
 * @param {Object} destination - Dirección de destino
 * @param {Array} packages - Paquetes a enviar
 * @param {Array} carriers - Carriers específicos (opcional)
 * @returns {Array} Lista de opciones de envío con precios
 */
export async function getShippingQuotes(destination, packages, carriers = SUPPORTED_CARRIERS) {
  // Debug: verificar configuración
  console.log('🔧 DEBUG Envia configuración:');
  console.log('   API Key existe:', !!ENVIA_API_KEY);
  console.log('   API Key length:', ENVIA_API_KEY?.length || 0);
  console.log('   API Key prefix:', ENVIA_API_KEY?.substring(0, 10) || 'N/A');
  console.log('   API URL:', ENVIA_API_URL);
  
  if (!isEnviaConfigured) {
    console.warn('⚠️ Envia API no configurada, usando tarifas fijas');
    return getFixedRates(destination);
  }

  console.log('🚚 Iniciando cotización con Envia...');
  console.log('📍 Origen:', ORIGIN_CONFIG.city, ORIGIN_CONFIG.state, ORIGIN_CONFIG.postalCode);
  console.log('📍 Destino:', destination.city, destination.state, destination.postalCode);
  console.log('📦 Carriers a consultar:', carriers.join(', '));

  const quotes = [];
  const errors = [];

  // Normalizar estados a códigos ISO de 2 caracteres
  const normalizedOriginState = normalizeStateCode(ORIGIN_CONFIG.state);
  const normalizedDestState = normalizeStateCode(destination.state);
  
  console.log(`📍 Estados normalizados: origen="${normalizedOriginState}", destino="${normalizedDestState}"`);

  // Hacer requests en paralelo a cada carrier
  const quotePromises = carriers.map(async (carrier) => {
    try {
      console.log(`   → Cotizando con ${carrier}...`);
      const startTime = Date.now();
      const response = await enviaClient.post('/ship/rate/', {
        origin: {
          name: ORIGIN_CONFIG.name,
          company: ORIGIN_CONFIG.company,
          email: ORIGIN_CONFIG.email,
          phone: ORIGIN_CONFIG.phone,
          street: ORIGIN_CONFIG.street,
          number: '',
          district: '',
          city: ORIGIN_CONFIG.city,
          state: normalizedOriginState,
          country: ORIGIN_CONFIG.country,
          postalCode: ORIGIN_CONFIG.postalCode
        },
        destination: {
          name: destination.name || 'Cliente',
          company: '',
          email: destination.email || '',
          phone: destination.phone || '',
          street: destination.street || 'Calle',
          number: destination.number || '1',
          district: destination.district || '',
          city: destination.city,
          state: normalizedDestState,
          country: destination.country || 'MX',
          postalCode: destination.postalCode
        },
        packages: packages.map(pkg => ({
          content: pkg.content || 'Miel artesanal',
          amount: pkg.quantity || 1,
          type: 'box',
          weight: pkg.weight || 1, // kg
          insurance: pkg.insurance || 0,
          declaredValue: pkg.declaredValue || 500,
          weightUnit: 'KG',
          lengthUnit: 'CM',
          dimensions: {
            length: pkg.length || 20,
            width: pkg.width || 15,
            height: pkg.height || 15
          }
        })),
        shipment: {
          carrier: carrier,
          type: 1 // 1 = Domestic
        },
        settings: {
          currency: 'MXN',
          printFormat: 'PDF',
          printSize: 'STOCK_4X6'
        }
      });

      const elapsed = Date.now() - startTime;
      console.log(`   ✓ ${carrier} respondió en ${elapsed}ms`);
      console.log(`   📦 Response status: ${response.status}`);
      console.log(`   📦 Response data keys:`, Object.keys(response.data || {}));
      
      if (response.data && response.data.data) {
        const services = response.data.data;
        console.log(`   📦 ${carrier}: ${services.length} servicios encontrados`);
        
        // Procesar cada servicio disponible del carrier
        services.forEach(service => {
          quotes.push({
            carrier: carrier,
            carrierName: getCarrierDisplayName(carrier),
            carrierLogo: getCarrierLogo(carrier),
            serviceId: service.serviceId || service.service,
            serviceName: service.serviceName || service.service,
            serviceDescription: service.serviceDescription || '',
            price: parseFloat(service.totalPrice || service.basePrice || 0),
            currency: 'MXN',
            deliveryDays: service.deliveryDays || service.deliveryEstimate || '3-5',
            deliveryDate: service.deliveryDate || null,
            isExpress: isExpressService(service.serviceName || service.service)
          });
        });
      } else {
        console.log(`   ⚠️ ${carrier}: No data en respuesta`, JSON.stringify(response.data || {}).substring(0, 200));
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      const errorData = error.response?.data;
      const errorStatus = error.response?.status;
      
      console.error(`❌ Error cotizando con ${carrier}:`);
      console.error(`   Mensaje: ${errorMsg}`);
      console.error(`   Status HTTP: ${errorStatus}`);
      console.error(`   Respuesta completa:`, JSON.stringify(errorData || {}, null, 2));
      
      errors.push({ 
        carrier, 
        error: errorMsg,
        status: errorStatus,
        details: errorData
      });
    }
  });

  await Promise.all(quotePromises);

  // Log de resumen
  console.log(`📊 Resumen cotización: ${quotes.length} exitosas, ${errors.length} errores`);
  if (errors.length > 0) {
    console.log(`📋 Carriers con error:`, errors.map(e => `${e.carrier}(${e.status})`).join(', '));
  }

  // Si no hay cotizaciones, devolver tarifas fijas como fallback
  if (quotes.length === 0) {
    console.warn('⚠️ No se obtuvieron cotizaciones, usando tarifas fijas');
    console.warn('📍 Origen configurado:', JSON.stringify(ORIGIN_CONFIG, null, 2));
    return getFixedRates(destination);
  }

  // Ordenar por precio
  quotes.sort((a, b) => a.price - b.price);

  return {
    quotes,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * Crear etiqueta de envío
 * @param {Object} shipmentData - Datos del envío
 * @returns {Object} Etiqueta con URL del PDF y tracking
 */
export async function createShippingLabel(shipmentData) {
  if (!isEnviaConfigured) {
    throw new Error('Envia API no configurada');
  }

  const {
    destination,
    packages,
    carrier,
    serviceId,
    orderId,
    orderNumber
  } = shipmentData;

  try {
    const response = await enviaClient.post('/ship/generate/', {
      origin: {
        name: ORIGIN_CONFIG.name,
        company: ORIGIN_CONFIG.company,
        email: ORIGIN_CONFIG.email,
        phone: ORIGIN_CONFIG.phone,
        street: ORIGIN_CONFIG.street,
        number: '',
        district: '',
        city: ORIGIN_CONFIG.city,
        state: ORIGIN_CONFIG.state,
        country: ORIGIN_CONFIG.country,
        postalCode: ORIGIN_CONFIG.postalCode,
        reference: `Pedido: ${orderNumber}`
      },
      destination: {
        name: destination.name,
        company: '',
        email: destination.email,
        phone: destination.phone,
        street: destination.street,
        number: destination.number || '',
        district: destination.district || '',
        city: destination.city,
        state: destination.state,
        country: destination.country || 'MX',
        postalCode: destination.postalCode,
        reference: destination.reference || ''
      },
      packages: packages.map(pkg => ({
        content: pkg.content || 'Miel artesanal',
        amount: pkg.quantity || 1,
        type: 'box',
        weight: pkg.weight || 1,
        insurance: pkg.insurance || 0,
        declaredValue: pkg.declaredValue || 500,
        weightUnit: 'KG',
        lengthUnit: 'CM',
        dimensions: {
          length: pkg.length || 20,
          width: pkg.width || 15,
          height: pkg.height || 15
        }
      })),
      shipment: {
        carrier: carrier,
        service: serviceId,
        type: 1
      },
      settings: {
        currency: 'MXN',
        printFormat: 'PDF',
        printSize: 'STOCK_4X6',
        comments: `Pedido #${orderNumber}`
      }
    });

    const result = response.data?.data?.[0] || response.data;

    return {
      success: true,
      labelId: result.carrierShipmentId || result.shipmentId,
      trackingNumber: result.trackingNumber,
      labelUrl: result.label,
      carrier: carrier,
      service: serviceId,
      estimatedDelivery: result.deliveryDate
    };
  } catch (error) {
    console.error('❌ Error creando etiqueta:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Error al generar la guía de envío');
  }
}

/**
 * Rastrear envío
 * @param {string} trackingNumber - Número de tracking
 * @param {string} carrier - Carrier
 * @returns {Object} Información de tracking
 */
export async function trackShipment(trackingNumber, carrier) {
  if (!isEnviaConfigured) {
    throw new Error('Envia API no configurada');
  }

  try {
    const response = await enviaClient.post('/ship/tracking/', {
      trackingNumber: trackingNumber,
      carrier: carrier
    });

    const data = response.data?.data || response.data;

    return {
      success: true,
      trackingNumber: trackingNumber,
      carrier: carrier,
      status: data.status || 'unknown',
      statusDescription: data.statusDescription || translateStatus(data.status),
      events: (data.events || data.checkpoints || []).map(event => ({
        date: event.date || event.timestamp,
        location: event.location || event.city,
        description: event.description || event.message,
        status: event.status
      })),
      estimatedDelivery: data.estimatedDelivery,
      deliveredAt: data.deliveredAt
    };
  } catch (error) {
    console.error('❌ Error tracking:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Error al rastrear el envío');
  }
}

/**
 * Programar recolección
 * @param {Object} pickupData - Datos de recolección
 * @returns {Object} Confirmación de recolección
 */
export async function schedulePickup(pickupData) {
  if (!isEnviaConfigured) {
    throw new Error('Envia API no configurada');
  }

  const {
    carrier,
    trackingNumbers,
    pickupDate,
    pickupTimeStart,
    pickupTimeEnd,
    packages
  } = pickupData;

  try {
    const response = await enviaClient.post('/ship/pickup/', {
      carrier: carrier,
      trackings: trackingNumbers,
      origin: {
        name: ORIGIN_CONFIG.name,
        company: ORIGIN_CONFIG.company,
        email: ORIGIN_CONFIG.email,
        phone: ORIGIN_CONFIG.phone,
        street: ORIGIN_CONFIG.street,
        city: ORIGIN_CONFIG.city,
        state: ORIGIN_CONFIG.state,
        country: ORIGIN_CONFIG.country,
        postalCode: ORIGIN_CONFIG.postalCode
      },
      pickup: {
        date: pickupDate,
        timeStart: pickupTimeStart || '09:00',
        timeEnd: pickupTimeEnd || '18:00'
      },
      settings: {
        packages: packages || 1
      }
    });

    const data = response.data?.data || response.data;

    return {
      success: true,
      pickupId: data.pickupId || data.confirmationNumber,
      confirmationNumber: data.confirmationNumber,
      pickupDate: pickupDate,
      message: 'Recolección programada exitosamente'
    };
  } catch (error) {
    console.error('❌ Error programando recolección:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Error al programar la recolección');
  }
}

/**
 * Cancelar envío
 * @param {string} labelId - ID de la etiqueta
 * @param {string} carrier - Carrier
 * @returns {Object} Resultado de cancelación
 */
export async function cancelShipment(labelId, carrier) {
  if (!isEnviaConfigured) {
    throw new Error('Envia API no configurada');
  }

  try {
    const response = await enviaClient.post('/ship/cancel/', {
      carrier: carrier,
      shipmentId: labelId
    });

    return {
      success: true,
      message: 'Envío cancelado exitosamente',
      refundAmount: response.data?.refundAmount || 0
    };
  } catch (error) {
    console.error('❌ Error cancelando envío:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Error al cancelar el envío');
  }
}

// =============================================
// FUNCIONES AUXILIARES
// =============================================

/**
 * Tarifas fijas como fallback cuando Envia no está disponible
 */
function getFixedRates(destination) {
  const baseRates = [
    {
      carrier: 'standard',
      carrierName: 'Envío Estándar',
      carrierLogo: null,
      serviceId: 'standard',
      serviceName: 'Estándar',
      serviceDescription: 'Entrega en 5-7 días hábiles',
      price: 99,
      currency: 'MXN',
      deliveryDays: '5-7',
      isExpress: false
    },
    {
      carrier: 'express',
      carrierName: 'Envío Express',
      carrierLogo: null,
      serviceId: 'express',
      serviceName: 'Express',
      serviceDescription: 'Entrega en 2-3 días hábiles',
      price: 149,
      currency: 'MXN',
      deliveryDays: '2-3',
      isExpress: true
    }
  ];

  // Envío gratis para pedidos mayores a $500
  return {
    quotes: baseRates,
    errors: null,
    isFallback: true
  };
}

/**
 * Obtener nombre de display del carrier
 */
function getCarrierDisplayName(carrier) {
  const names = {
    'estafeta': 'Estafeta',
    'fedex': 'FedEx',
    'dhl': 'DHL Express',
    'redpack': 'Redpack',
    'paquetexpress': 'Paquete Express',
    '99minutos': '99 Minutos',
    'ups': 'UPS',
    'sendex': 'Sendex'
  };
  return names[carrier.toLowerCase()] || carrier;
}

/**
 * Obtener logo del carrier
 */
function getCarrierLogo(carrier) {
  const logos = {
    'estafeta': '/assets/img/carriers/estafeta.png',
    'fedex': '/assets/img/carriers/fedex.png',
    'dhl': '/assets/img/carriers/dhl.png',
    'redpack': '/assets/img/carriers/redpack.png'
  };
  return logos[carrier.toLowerCase()] || null;
}

/**
 * Determinar si es servicio express
 */
function isExpressService(serviceName) {
  const expressKeywords = ['express', 'priority', 'overnight', 'next day', 'same day', '24h', '99 min'];
  const lowerName = (serviceName || '').toLowerCase();
  return expressKeywords.some(keyword => lowerName.includes(keyword));
}

/**
 * Traducir status de tracking
 */
function translateStatus(status) {
  const translations = {
    'pending': 'Pendiente de recolección',
    'picked_up': 'Recolectado',
    'in_transit': 'En tránsito',
    'out_for_delivery': 'En camino a entrega',
    'delivered': 'Entregado',
    'exception': 'Incidencia',
    'returned': 'Devuelto',
    'cancelled': 'Cancelado'
  };
  return translations[status?.toLowerCase()] || status || 'Desconocido';
}

/**
 * Calcular peso total del carrito
 */
export function calculateCartWeight(items) {
  return items.reduce((total, item) => {
    // Asumir 0.5kg por producto si no tiene peso definido
    const weight = parseFloat(item.weight) || 0.5;
    return total + (weight * item.quantity);
  }, 0);
}

/**
 * Preparar paquetes desde items del carrito
 */
export function preparePackagesFromCart(items) {
  const totalWeight = calculateCartWeight(items);
  const totalValue = items.reduce((sum, item) => {
    return sum + ((item.sale_price || item.price) * item.quantity);
  }, 0);

  // Por ahora, enviar como un solo paquete
  return [{
    content: 'Miel artesanal y productos de colmena',
    quantity: 1,
    weight: Math.max(totalWeight, 0.5), // Mínimo 0.5 kg
    declaredValue: totalValue,
    length: 30,
    width: 25,
    height: 20
  }];
}

export default {
  isEnviaConfigured,
  getShippingQuotes,
  createShippingLabel,
  trackShipment,
  schedulePickup,
  cancelShipment,
  calculateCartWeight,
  preparePackagesFromCart
};
