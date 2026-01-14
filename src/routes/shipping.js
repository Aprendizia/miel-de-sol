/**
 * Shipping Routes - Rutas para cotización y gestión de envíos
 * Integración con Envia.com API
 */

import express from 'express';
import { supabaseAdmin, isDemoMode } from '../config/supabase.js';
import {
  isEnviaConfigured,
  getShippingQuotes,
  createShippingLabel,
  trackShipment,
  schedulePickup,
  cancelShipment,
  preparePackagesFromCart
} from '../services/envia.js';

const router = express.Router();

// Middleware para verificar admin
const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Acceso denegado' });
  }
  next();
};

/**
 * POST /api/shipping/quote
 * Obtener cotizaciones de envío en tiempo real
 */
router.post('/quote', async (req, res) => {
  try {
    const {
      postalCode,
      city,
      state,
      street,
      name,
      email,
      phone
    } = req.body;

    // Validar código postal
    if (!postalCode || postalCode.length !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Código postal inválido'
      });
    }

    // Obtener items del carrito de la sesión
    const cart = req.session.cart || { items: [] };
    
    if (cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El carrito está vacío'
      });
    }

    // Preparar paquetes desde el carrito
    const packages = preparePackagesFromCart(cart.items);

    // Calcular subtotal para verificar envío gratis
    const subtotal = cart.items.reduce((sum, item) => {
      return sum + ((item.sale_price || item.price) * item.quantity);
    }, 0);

    // Obtener cotizaciones
    const destination = {
      name: name || 'Cliente',
      email: email || '',
      phone: phone || '',
      street: street || '',
      city: city || '',
      state: state || '',
      postalCode: postalCode,
      country: 'MX'
    };

    const result = await getShippingQuotes(destination, packages);

    // Aplicar envío gratis si aplica
    const freeShippingThreshold = 500;
    let quotes = result.quotes.map(quote => ({
      ...quote,
      originalPrice: quote.price,
      price: subtotal >= freeShippingThreshold ? 0 : quote.price,
      isFree: subtotal >= freeShippingThreshold
    }));

    // Filtrar a solo 2 opciones: más barata y más rápida
    let finalQuotes = [];
    
    if (quotes.length > 0) {
      // Ordenar por precio para encontrar la más barata
      const sortedByPrice = [...quotes].sort((a, b) => a.originalPrice - b.originalPrice);
      const cheapest = sortedByPrice[0];
      
      // Ordenar por días de entrega para encontrar la más rápida
      const sortedBySpeed = [...quotes].sort((a, b) => {
        const daysA = parseInt(a.deliveryDays) || 99;
        const daysB = parseInt(b.deliveryDays) || 99;
        return daysA - daysB;
      });
      const fastest = sortedBySpeed[0];
      
      // Agregar la más económica
      finalQuotes.push({
        ...cheapest,
        recommendedLabel: 'Más económico'
      });
      
      // Agregar la más rápida solo si es diferente a la más barata
      if (fastest.carrier !== cheapest.carrier || fastest.serviceId !== cheapest.serviceId) {
        finalQuotes.push({
          ...fastest,
          recommendedLabel: 'Más rápido',
          isExpress: true
        });
      }
      
      // Aplicar envío gratis si aplica
      if (subtotal >= freeShippingThreshold) {
        finalQuotes = finalQuotes.map(q => ({
          ...q,
          originalPrice: q.price,
          price: 0,
          isFree: true
        }));
      }
    }

    quotes = finalQuotes;

    // Log de cotizaciones finales
    console.log(`📋 Cotizaciones finales a enviar: ${quotes.length}`);
    quotes.forEach((q, i) => {
      console.log(`   ${i+1}. ${q.carrierName} - ${q.serviceName} - $${q.price} (${q.deliveryDays} días)`);
    });

    res.json({
      success: true,
      quotes: quotes,
      freeShippingThreshold,
      subtotal,
      qualifiesForFreeShipping: subtotal >= freeShippingThreshold,
      isFallback: result.isFallback || false,
      errors: result.errors
    });
  } catch (error) {
    console.error('❌ Error en cotización de envío:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener cotizaciones de envío'
    });
  }
});

/**
 * POST /api/shipping/validate-postal-code
 * Validar código postal y obtener ciudad/estado
 */
router.post('/validate-postal-code', async (req, res) => {
  try {
    const { postalCode } = req.body;

    if (!postalCode || postalCode.length !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Código postal inválido'
      });
    }

    // Por ahora, usar una API pública de códigos postales de México
    // o devolver datos estáticos
    // TODO: Integrar con API de Envia para validación
    
    res.json({
      success: true,
      valid: true,
      postalCode: postalCode,
      // Estos datos deberían venir de la API
      city: null,
      state: null,
      neighborhoods: []
    });
  } catch (error) {
    console.error('❌ Error validando CP:', error);
    res.status(500).json({
      success: false,
      error: 'Error al validar código postal'
    });
  }
});

/**
 * POST /api/shipping/label
 * Crear etiqueta de envío (Solo admin)
 */
router.post('/label', requireAdmin, async (req, res) => {
  try {
    const {
      orderId,
      carrier,
      serviceId
    } = req.body;

    if (!orderId || !carrier || !serviceId) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos requeridos'
      });
    }

    if (!isEnviaConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Envia API no configurada'
      });
    }

    // Obtener datos de la orden
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({
        success: false,
        error: 'Orden no encontrada'
      });
    }

    // Preparar datos del envío
    const shippingAddress = order.shipping_address;
    const destination = {
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      street: shippingAddress.street,
      city: shippingAddress.city,
      state: shippingAddress.state,
      postalCode: shippingAddress.postal_code,
      country: shippingAddress.country || 'MX',
      reference: shippingAddress.reference || order.customer_notes
    };

    // Preparar paquetes
    const packages = preparePackagesFromCart(order.order_items.map(item => ({
      ...item,
      price: item.unit_price,
      quantity: item.quantity,
      weight: 0.5 // Asumir peso si no está en la orden
    })));

    // Crear etiqueta
    const result = await createShippingLabel({
      destination,
      packages,
      carrier,
      serviceId,
      orderId: order.id,
      orderNumber: order.order_number
    });

    // Guardar en base de datos
    const { data: shipment, error: shipmentError } = await supabaseAdmin
      .from('shipments')
      .insert({
        order_id: order.id,
        carrier: carrier,
        service: serviceId,
        tracking_number: result.trackingNumber,
        label_url: result.labelUrl,
        label_id: result.labelId,
        quoted_price: order.shipping_cost,
        status: 'label_created'
      })
      .select()
      .single();

    if (shipmentError) {
      console.error('Error guardando shipment:', shipmentError);
    }

    // Actualizar orden con tracking
    await supabaseAdmin
      .from('orders')
      .update({
        tracking_number: result.trackingNumber,
        shipping_carrier: carrier,
        status: 'processing'
      })
      .eq('id', orderId);

    res.json({
      success: true,
      data: {
        trackingNumber: result.trackingNumber,
        labelUrl: result.labelUrl,
        carrier: carrier,
        estimatedDelivery: result.estimatedDelivery
      }
    });
  } catch (error) {
    console.error('❌ Error creando etiqueta:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al crear la etiqueta de envío'
    });
  }
});

/**
 * GET /api/shipping/track/:trackingNumber
 * Rastrear envío
 */
router.get('/track/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    const { carrier } = req.query;

    if (!trackingNumber) {
      return res.status(400).json({
        success: false,
        error: 'Número de rastreo requerido'
      });
    }

    // Si no tenemos carrier, intentar buscarlo en la BD
    let shipmentCarrier = carrier;
    
    if (!shipmentCarrier && !isDemoMode) {
      const { data: shipment } = await supabaseAdmin
        .from('shipments')
        .select('carrier')
        .eq('tracking_number', trackingNumber)
        .single();
      
      shipmentCarrier = shipment?.carrier;
    }

    if (!shipmentCarrier) {
      return res.status(400).json({
        success: false,
        error: 'Carrier no especificado'
      });
    }

    if (!isEnviaConfigured) {
      // Devolver tracking simulado
      return res.json({
        success: true,
        data: {
          trackingNumber,
          carrier: shipmentCarrier,
          status: 'in_transit',
          statusDescription: 'En tránsito',
          events: [
            {
              date: new Date().toISOString(),
              location: 'Centro de distribución',
              description: 'Paquete en tránsito',
              status: 'in_transit'
            }
          ]
        },
        isSimulated: true
      });
    }

    const result = await trackShipment(trackingNumber, shipmentCarrier);

    // Actualizar status en BD si cambió
    if (!isDemoMode && result.status) {
      await supabaseAdmin
        .from('shipments')
        .update({ 
          status: result.status,
          updated_at: new Date().toISOString()
        })
        .eq('tracking_number', trackingNumber);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error tracking:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al rastrear el envío'
    });
  }
});

/**
 * POST /api/shipping/pickup
 * Programar recolección (Solo admin)
 */
router.post('/pickup', requireAdmin, async (req, res) => {
  try {
    const {
      carrier,
      trackingNumbers,
      pickupDate,
      pickupTimeStart,
      pickupTimeEnd,
      packages
    } = req.body;

    if (!carrier || !trackingNumbers || !pickupDate) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos requeridos'
      });
    }

    if (!isEnviaConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Envia API no configurada'
      });
    }

    const result = await schedulePickup({
      carrier,
      trackingNumbers: Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers],
      pickupDate,
      pickupTimeStart,
      pickupTimeEnd,
      packages
    });

    // Actualizar shipments en BD
    if (!isDemoMode) {
      await supabaseAdmin
        .from('shipments')
        .update({ pickup_scheduled: true })
        .in('tracking_number', Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers]);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error programando recolección:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al programar la recolección'
    });
  }
});

/**
 * DELETE /api/shipping/cancel/:labelId
 * Cancelar envío (Solo admin)
 */
router.delete('/cancel/:labelId', requireAdmin, async (req, res) => {
  try {
    const { labelId } = req.params;
    const { carrier } = req.body;

    if (!labelId || !carrier) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos requeridos'
      });
    }

    if (!isEnviaConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Envia API no configurada'
      });
    }

    const result = await cancelShipment(labelId, carrier);

    // Actualizar en BD
    if (!isDemoMode) {
      await supabaseAdmin
        .from('shipments')
        .update({ status: 'cancelled' })
        .eq('label_id', labelId);
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error cancelando envío:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al cancelar el envío'
    });
  }
});

/**
 * GET /api/shipping/status
 * Estado de la configuración de envíos
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    configured: isEnviaConfigured,
    provider: 'envia.com',
    features: {
      quotes: true,
      labels: isEnviaConfigured,
      tracking: isEnviaConfigured,
      pickup: isEnviaConfigured,
      webhooks: true
    }
  });
});

/**
 * POST /api/shipping/webhook/envia
 * Webhook para recibir actualizaciones de estado de Envia.com
 * Documentación: https://docs.envia.com/reference/webhooks
 */
router.post('/webhook/envia', async (req, res) => {
  try {
    const payload = req.body;
    
    console.log('📬 Webhook Envia recibido:', JSON.stringify(payload, null, 2));

    // Extraer datos del webhook
    const trackingNumber = payload?.trackingNumber || payload?.tracking_number || payload?.guia;
    const enviaStatus = payload?.status || payload?.shipmentStatus || payload?.event;
    const carrier = payload?.carrier;
    const description = payload?.description || payload?.message || payload?.statusDescription;
    const location = payload?.location || payload?.city;
    const eventDate = payload?.date || payload?.timestamp || new Date().toISOString();

    // Validar datos mínimos
    if (!trackingNumber) {
      console.warn('⚠️ Webhook sin tracking number:', payload);
      return res.status(200).json({ received: true, processed: false, reason: 'no_tracking' });
    }

    // Log del webhook en BD
    if (!isDemoMode) {
      try {
        await supabaseAdmin.from('envia_webhook_logs').insert({
          tracking_number: trackingNumber,
          carrier: carrier,
          event_type: enviaStatus,
          payload: payload,
          received_at: new Date().toISOString()
        });
      } catch (logErr) {
        console.error('Error logging webhook:', logErr);
      }
    }

    // Buscar el shipment correspondiente
    const { data: shipment } = await supabaseAdmin
      .from('shipments')
      .select('id, order_id, status')
      .eq('tracking_number', trackingNumber)
      .single();

    if (!shipment) {
      console.warn(`⚠️ Shipment no encontrado para tracking: ${trackingNumber}`);
      return res.status(200).json({ received: true, processed: false, reason: 'shipment_not_found' });
    }

    // Importar mapeo de estados
    const { mapEnviaStatus, translateStatus, isFinalStatus } = await import('../services/envia.js');
    
    // Mapear estado
    const newStatus = mapEnviaStatus(enviaStatus);
    const previousStatus = shipment.status;

    console.log(`📦 Actualizando shipment: ${trackingNumber} | ${previousStatus} → ${newStatus} (${enviaStatus})`);

    // Actualizar shipment
    await supabaseAdmin
      .from('shipments')
      .update({
        status: newStatus,
        status_description: description || translateStatus(newStatus),
        last_event_description: description,
        last_event_location: location,
        last_event_at: eventDate,
        last_sync_at: new Date().toISOString(),
        delivered_at: newStatus === 'delivered' ? eventDate : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', shipment.id);

    // Guardar evento
    await supabaseAdmin.from('shipment_events').insert({
      shipment_id: shipment.id,
      event_status: newStatus,
      event_description: description,
      event_location: location,
      envia_event_code: enviaStatus,
      envia_raw_response: payload,
      event_at: eventDate
    });

    // Actualizar estado de la orden según el evento
    let orderUpdate = null;

    // picked_up → orden pasa a 'shipped'
    if (newStatus === 'picked_up' && previousStatus !== 'picked_up') {
      orderUpdate = { status: 'shipped' };
      console.log(`📤 Orden marcada como enviada - Tracking: ${trackingNumber}`);
    }

    // in_transit también indica que fue enviado
    if (newStatus === 'in_transit' && !['picked_up', 'in_transit', 'out_for_delivery', 'delivered'].includes(previousStatus)) {
      orderUpdate = { status: 'shipped' };
    }

    // delivered → orden pasa a 'delivered'
    if (newStatus === 'delivered') {
      orderUpdate = { status: 'delivered' };
      console.log(`✅ Orden marcada como entregada - Tracking: ${trackingNumber}`);
    }

    if (orderUpdate) {
      await supabaseAdmin
        .from('orders')
        .update({ ...orderUpdate, updated_at: new Date().toISOString() })
        .eq('id', shipment.order_id);
    }

    // Marcar webhook como procesado
    await supabaseAdmin
      .from('envia_webhook_logs')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('tracking_number', trackingNumber)
      .order('received_at', { ascending: false })
      .limit(1);

    res.status(200).json({ 
      received: true, 
      processed: true,
      trackingNumber,
      newStatus,
      statusDescription: translateStatus(newStatus)
    });

  } catch (error) {
    console.error('❌ Error procesando webhook Envia:', error);
    
    // Siempre responder 200 para que Envia no reintente
    res.status(200).json({ 
      received: true, 
      processed: false, 
      error: error.message 
    });
  }
});

export default router;
