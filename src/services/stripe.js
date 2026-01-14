import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

// Debug: log if key exists (not the actual key)
console.log('🔑 STRIPE_SECRET_KEY exists:', !!stripeSecretKey);
console.log('🔑 STRIPE_SECRET_KEY starts with sk_:', stripeSecretKey?.startsWith('sk_'));

// Check if Stripe is configured
export const isStripeConfigured = !!(stripeSecretKey && 
  stripeSecretKey.startsWith('sk_') &&
  stripeSecretKey.length > 20);

let stripe = null;

if (isStripeConfigured) {
  try {
    stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16'
    });
    console.log('✅ Stripe configurado correctamente');
  } catch (e) {
    console.error('❌ Error inicializando Stripe:', e.message);
  }
} else {
  console.log('⚠️  Stripe no configurado - Pagos deshabilitados');
  console.log('   Verifica que STRIPE_SECRET_KEY esté en las variables de entorno');
}

/**
 * Create a Stripe Checkout Session
 * @param {Object} cart - Cart object with items and totals
 * @param {Object} customer - Customer info (email, name)
 * @param {string} orderId - Internal order ID for reference
 * @returns {Object} Stripe checkout session
 */
export async function createCheckoutSession(cart, customer, orderId) {
  if (!isStripeConfigured) {
    throw new Error('Stripe no está configurado');
  }

  const lineItems = cart.items.map(item => {
    const productData = {
      name: item.name,
    };
    
    // Only add description if it exists
    if (item.weight) {
      productData.description = item.weight;
    }
    
    // Only add images if URL is valid and absolute
    if (item.image_url && process.env.APP_URL) {
      const imageUrl = item.image_url.startsWith('http') 
        ? item.image_url 
        : `${process.env.APP_URL.replace(/\/$/, '')}${item.image_url}`;
      productData.images = [imageUrl];
    }
    
    return {
      price_data: {
        currency: 'mxn',
        product_data: productData,
        unit_amount: Math.round((item.sale_price || item.price) * 100), // Stripe uses cents
      },
      quantity: item.quantity,
    };
  });

  // Add shipping as a line item if applicable
  if (cart.shipping > 0) {
    lineItems.push({
      price_data: {
        currency: 'mxn',
        product_data: {
          name: 'Envío',
          description: 'Costo de envío estándar',
        },
        unit_amount: Math.round(cart.shipping * 100),
      },
      quantity: 1,
    });
  }

  const appUrl = process.env.APP_URL.replace(/\/$/, ''); // Remove trailing slash
  
  console.log('📦 Creating Stripe session with', lineItems.length, 'items');
  console.log('🔗 Success URL:', `${appUrl}/cart/payment-success?session_id={CHECKOUT_SESSION_ID}`);
  
  const sessionConfig = {
    payment_method_types: ['card'],
    line_items: lineItems,
    mode: 'payment',
    customer_email: customer.email,
    client_reference_id: orderId,
    success_url: `${appUrl}/cart/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/cart/checkout`,
    metadata: {
      order_id: orderId,
      customer_name: customer.name,
      customer_phone: customer.phone || '',
    },
    locale: 'es',
  };

  const session = await stripe.checkout.sessions.create(sessionConfig);
  
  console.log('✅ Stripe session created successfully:', session.id);

  return session;
}

/**
 * Retrieve a checkout session
 * @param {string} sessionId - Stripe session ID
 * @returns {Object} Stripe session
 */
export async function getCheckoutSession(sessionId) {
  if (!isStripeConfigured) {
    throw new Error('Stripe no está configurado');
  }

  return await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent', 'line_items']
  });
}

/**
 * Handle Stripe webhook events
 * @param {Buffer} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @returns {Object} Stripe event
 */
export function constructWebhookEvent(payload, signature) {
  if (!isStripeConfigured) {
    throw new Error('Stripe no está configurado');
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    throw new Error('Webhook secret no configurado');
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export { stripe };
export default stripe;
