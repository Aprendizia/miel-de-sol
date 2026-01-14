import express from 'express';
import { validationResult } from 'express-validator';
import { supabase, supabaseAdmin, isDemoMode } from '../config/supabase.js';
import { demoDb } from '../data/demo-data.js';
import { createCheckoutSession, getCheckoutSession, isStripeConfigured } from '../services/stripe.js';
import { validateAddToCart, validateUpdateCart, validateCheckout, checkoutLimiter } from '../middleware/security.js';
import { decrementStockForOrder } from './api.js';

const router = express.Router();

// Initialize cart in session if not exists
function initCart(req) {
  if (!req.session.cart) {
    req.session.cart = {
      items: [],
      subtotal: 0,
      shipping: 0,
      total: 0
    };
  }
  return req.session.cart;
}

// Calculate cart totals
function calculateTotals(cart) {
  cart.subtotal = cart.items.reduce((sum, item) => {
    const price = item.sale_price || item.price;
    return sum + (price * item.quantity);
  }, 0);
  
  // Envío gratis por ahora
  cart.shipping = 0;
  cart.total = cart.subtotal + cart.shipping;
  
  return cart;
}

// View cart
router.get('/', (req, res) => {
  const cart = initCart(req);
  
  res.render('pages/cart', {
    title: 'Carrito de Compras',
    cart: calculateTotals(cart)
  });
});

// Add to cart
router.post('/add', validateAddToCart, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const cart = initCart(req);
    const isAjax = req.xhr || req.headers.accept?.includes('application/json');

    let product;

    if (isDemoMode) {
      product = demoDb.getProductById(String(productId));
    } else {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      product = data;
    }

    if (!product) {
      if (isAjax) {
        return res.json({ success: false, message: 'Producto no encontrado' });
      }
      req.session.error = 'Producto no encontrado';
      return res.redirect('back');
    }

    // Check stock
    if (product.stock_quantity < quantity) {
      if (isAjax) {
        return res.json({ success: false, message: 'Stock insuficiente' });
      }
      req.session.error = 'Stock insuficiente';
      return res.redirect('back');
    }

    // Check if item already in cart
    const existingIndex = cart.items.findIndex(item => String(item.id) === String(productId));

    if (existingIndex > -1) {
      const newQuantity = cart.items[existingIndex].quantity + parseInt(quantity);
      
      if (newQuantity > product.stock_quantity) {
        if (isAjax) {
          return res.json({ success: false, message: `Solo hay ${product.stock_quantity} unidades disponibles` });
        }
        req.session.error = `Solo hay ${product.stock_quantity} unidades disponibles`;
        return res.redirect('back');
      }
      
      cart.items[existingIndex].quantity = newQuantity;
    } else {
      cart.items.push({
        id: String(product.id),
        name: product.name,
        slug: product.slug,
        price: parseFloat(product.price),
        sale_price: product.sale_price ? parseFloat(product.sale_price) : null,
        weight: product.weight,
        image_url: product.image_url,
        quantity: parseInt(quantity),
        max_quantity: product.stock_quantity
      });
    }

    calculateTotals(cart);
    req.session.cart = cart;
    
    const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    if (isAjax) {
      return res.json({ 
        success: true, 
        message: 'Producto agregado al carrito',
        cartCount: cartCount,
        cart: cart
      });
    }

    req.session.success = 'Producto agregado al carrito';
    res.redirect('/cart');
  } catch (error) {
    console.error('Add to cart error:', error);
    const isAjax = req.xhr || req.headers.accept?.includes('application/json');
    
    if (isAjax) {
      return res.status(500).json({ success: false, message: 'Error al agregar al carrito' });
    }
    req.session.error = 'Error al agregar al carrito';
    res.redirect('back');
  }
});

// Update cart item quantity
router.post('/update', validateUpdateCart, (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const cart = initCart(req);

    const itemIndex = cart.items.findIndex(item => item.id === productId);

    if (itemIndex === -1) {
      req.session.error = 'Producto no encontrado en el carrito';
      return res.redirect('/cart');
    }

    if (quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    } else if (quantity > cart.items[itemIndex].max_quantity) {
      req.session.error = `Máximo ${cart.items[itemIndex].max_quantity} unidades disponibles`;
      return res.redirect('/cart');
    } else {
      cart.items[itemIndex].quantity = parseInt(quantity);
    }

    calculateTotals(cart);
    req.session.cart = cart;

    res.redirect('/cart');
  } catch (error) {
    console.error('Update cart error:', error);
    req.session.error = 'Error al actualizar el carrito';
    res.redirect('/cart');
  }
});

// Remove from cart
router.post('/remove', (req, res) => {
  try {
    const { productId } = req.body;
    const cart = initCart(req);

    cart.items = cart.items.filter(item => item.id !== productId);
    calculateTotals(cart);
    req.session.cart = cart;

    res.redirect('/cart');
  } catch (error) {
    console.error('Remove from cart error:', error);
    req.session.error = 'Error al eliminar del carrito';
    res.redirect('/cart');
  }
});

// Clear cart
router.get('/clear', (req, res) => {
  req.session.cart = {
    items: [],
    subtotal: 0,
    shipping: 0,
    total: 0
  };

  res.redirect('/cart');
});

// Checkout page
router.get('/checkout', (req, res) => {
  const cart = initCart(req);

  if (cart.items.length === 0) {
    req.session.error = 'Tu carrito está vacío';
    return res.redirect('/cart');
  }

  // Obtener y limpiar error de sesión
  const error = req.session.error;
  req.session.error = null;

  res.render('pages/checkout', {
    title: 'Finalizar Compra',
    cart: calculateTotals(cart),
    stripeConfigured: isStripeConfigured,
    error: error
  });
});

// Process checkout - Create order and redirect to Stripe
router.post('/process-checkout', checkoutLimiter, validateCheckout, async (req, res) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Errores de validación:', errors.array());
      req.session.error = errors.array()[0].msg;
      return res.redirect('/cart/checkout');
    }

    const cart = initCart(req);
    
    if (cart.items.length === 0) {
      req.session.error = 'El carrito está vacío';
      return res.redirect('/cart');
    }

    const { 
      first_name,
      last_name,
      email, 
      phone,
      address,
      city,
      state,
      postal_code,
      country,
      notes,
      // Datos de envío seleccionado
      shipping_carrier,
      shipping_service,
      shipping_price,
      shipping_name
    } = req.body;

    const customerName = `${first_name} ${last_name}`;
    const shippingAddress = {
      street: address,
      city,
      state,
      postal_code,
      country: country || 'México'
    };
    
    // Calcular costo de envío
    const shippingCost = parseFloat(shipping_price) || 0;
    
    // Actualizar totales del carrito con envío real
    cart.shipping = shippingCost;
    cart.total = cart.subtotal + shippingCost;

    // Create order in database first (pending payment)
    let orderId;
    let orderNumber;

    if (isDemoMode) {
      orderId = 'demo-' + Date.now();
      orderNumber = Date.now().toString(36).toUpperCase();
    } else {
      // Use admin client to bypass RLS for order creation
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .insert({
          user_id: req.session.user?.id || null,
          customer_name: customerName,
          customer_email: email,
          customer_phone: phone,
          shipping_address: shippingAddress,
          subtotal: cart.subtotal,
          shipping_cost: shippingCost,
          total: cart.total,
          customer_notes: notes,
          status: 'pending',
          payment_status: 'pending',
          // Datos del carrier seleccionado
          shipping_carrier: shipping_carrier || null,
          shipping_method: shipping_name || null
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Insert order items
      const orderItems = cart.items.map(item => ({
        order_id: order.id,
        product_id: item.id,
        product_name: item.name,
        product_image: item.image_url,
        quantity: item.quantity,
        unit_price: item.sale_price || item.price,
        total_price: (item.sale_price || item.price) * item.quantity
      }));

      await supabaseAdmin.from('order_items').insert(orderItems);

      orderId = order.id;
      orderNumber = order.order_number;
    }

    // Store order info in session for later
    req.session.pendingOrder = {
      orderId,
      orderNumber,
      email,
      customerName,
      phone,
      shippingAddress,
      cart: { ...cart }
    };

    // If Stripe is configured, redirect to Stripe Checkout
    console.log('🔄 Checking Stripe config:', isStripeConfigured);
    if (isStripeConfigured) {
      // Stripe minimum is $10 MXN
      if (cart.total < 10) {
        req.session.error = 'El monto mínimo para pagar con tarjeta es $10 MXN. Agrega más productos o usa transferencia bancaria.';
        return res.redirect('/cart/checkout');
      }
      
      try {
        console.log('🔄 Creating Stripe session for order:', orderId);
        console.log('🔄 Cart items:', cart.items.length, 'Total:', cart.total);
        
        const session = await createCheckoutSession(
          cart,
          { email, name: customerName, phone },
          orderId.toString()
        );

        console.log('✅ Stripe session created:', session.id);
        console.log('🔗 Redirecting to:', session.url);
        
        return res.redirect(303, session.url);
      } catch (stripeError) {
        console.error('❌ Stripe error:', stripeError.message);
        req.session.error = 'Error al procesar el pago. Intenta de nuevo o usa transferencia bancaria.';
        return res.redirect('/cart/checkout');
      }
    } else {
      console.log('⚠️ Stripe not configured, showing bank transfer');
    }

    // No Stripe - show bank transfer instructions
    // Decrement stock for non-Stripe orders (will be confirmed manually)
    if (!isDemoMode && orderId && !orderId.toString().startsWith('demo')) {
      await decrementStockForOrder(orderId);
    }
    
    req.session.cart = { items: [], subtotal: 0, shipping: 0, total: 0 };
    
    return res.redirect(`/cart/order-pending/${orderNumber || orderId}`);
  } catch (error) {
    console.error('Checkout error:', error);
    req.session.error = 'Error al procesar el pedido. Intenta de nuevo.';
    res.redirect('/cart/checkout');
  }
});

// Stripe payment success callback
router.get('/payment-success', async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.redirect('/cart');
    }

    // Get session from Stripe
    const session = await getCheckoutSession(session_id);

    if (session.payment_status === 'paid') {
      const orderId = session.client_reference_id;

      // Update order status in database
      if (!isDemoMode && orderId && !orderId.startsWith('demo')) {
        await supabaseAdmin
          .from('orders')
          .update({
            payment_status: 'paid',
            status: 'confirmed',
            payment_id: session.payment_intent?.id || session.id,
            payment_method: 'stripe'
          })
          .eq('id', orderId);

        // Get order details for confirmation page
        const { data: order } = await supabaseAdmin
          .from('orders')
          .select('*, order_items(*)')
          .eq('id', orderId)
          .single();

        // Clear cart
        req.session.cart = { items: [], subtotal: 0, shipping: 0, total: 0 };
        req.session.pendingOrder = null;

        return res.render('pages/order-confirmation', {
          title: '¡Pedido Confirmado!',
          order: {
            ...order,
            items: order.order_items
          },
          paymentSuccess: true
        });
      }
    }

    // Fallback for demo or issues
    const pendingOrder = req.session.pendingOrder;
    req.session.cart = { items: [], subtotal: 0, shipping: 0, total: 0 };
    req.session.pendingOrder = null;

    res.render('pages/order-confirmation', {
      title: '¡Pedido Confirmado!',
      order: {
        order_number: pendingOrder?.orderNumber || session.client_reference_id,
        email: session.customer_email,
        total: session.amount_total / 100,
        shipping: 0,
        subtotal: session.amount_total / 100,
        items: pendingOrder?.cart?.items || []
      },
      paymentSuccess: true
    });
  } catch (error) {
    console.error('Payment success error:', error);
    req.session.success = '¡Gracias por tu compra! Tu pedido ha sido procesado.';
    res.redirect('/');
  }
});

// Order pending (bank transfer) page
router.get('/order-pending/:orderNumber', async (req, res) => {
  const { orderNumber } = req.params;
  const pendingOrder = req.session.pendingOrder;

  res.render('pages/order-pending', {
    title: 'Pedido Pendiente de Pago',
    order: {
      order_number: orderNumber,
      email: pendingOrder?.email || 'tu correo',
      total: pendingOrder?.cart?.total || 0,
      ...pendingOrder
    }
  });
});

// Order confirmation (legacy route)
router.get('/order/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;

    if (isDemoMode || orderNumber.startsWith('demo-')) {
      return res.render('pages/order-confirmation', {
        title: `Pedido #${orderNumber}`,
        order: {
          order_number: orderNumber.replace('demo-', ''),
          email: 'demo@email.com',
          total: 500,
          shipping: 0,
          subtotal: 500,
          items: [{ name: 'Producto Demo', quantity: 1, price: 500 }]
        }
      });
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('order_number', orderNumber)
      .single();

    if (error || !order) {
      return res.status(404).render('pages/errors/404', {
        title: 'Pedido no encontrado'
      });
    }

    res.render('pages/order-confirmation', {
      title: `Pedido #${order.order_number}`,
      order: {
        ...order,
        items: order.order_items
      }
    });
  } catch (error) {
    console.error('Order confirmation error:', error);
    res.status(500).render('pages/errors/500', { title: 'Error' });
  }
});

export default router;
