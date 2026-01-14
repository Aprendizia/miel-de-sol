/**
 * Email Service - Transactional emails with Resend
 * https://resend.com/docs
 */

import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || 'Miel de Sol <pedidos@mieldesol.com>';
const STORE_NAME = process.env.STORE_NAME || 'Miel de Sol';
const STORE_URL = process.env.APP_URL || 'https://mieldesol.com';

// Check if Resend is configured
export const isEmailConfigured = !!RESEND_API_KEY && RESEND_API_KEY !== 'your-resend-api-key';

let resend = null;

if (isEmailConfigured) {
  resend = new Resend(RESEND_API_KEY);
  console.log('✅ Resend email service configured');
} else {
  console.log('⚠️  Resend not configured - emails will be logged only');
}

// =============================================
// EMAIL TEMPLATES
// =============================================

/**
 * Base email template wrapper
 */
function baseTemplate(content, preheader = '') {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${STORE_NAME}</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; }
    .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: linear-gradient(135deg, #C79A2A 0%, #A66E17 100%); padding: 30px 40px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; font-weight: 300; letter-spacing: 3px; }
    .content { padding: 40px; }
    .footer { background: #1a1a1a; color: #888; padding: 30px 40px; text-align: center; font-size: 13px; }
    .footer a { color: #C79A2A; text-decoration: none; }
    .btn { display: inline-block; background: #C79A2A; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .btn:hover { background: #A66E17; }
    .order-box { background: #FDF8F0; border: 1px solid #E8DCC8; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .product-row { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee; }
    .product-row:last-child { border-bottom: none; }
    .product-img { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; margin-right: 15px; }
    .product-info { flex: 1; }
    .product-name { font-weight: 600; color: #333; }
    .product-qty { color: #666; font-size: 14px; }
    .product-price { font-weight: 600; color: #C79A2A; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
    .total-row.final { border-top: 2px solid #C79A2A; margin-top: 10px; padding-top: 15px; font-size: 18px; font-weight: 700; }
    .address-box { background: #f9f9f9; border-radius: 8px; padding: 20px; margin: 15px 0; }
    .tracking-box { background: #E8F5E9; border: 1px solid #A5D6A7; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .tracking-number { font-size: 24px; font-weight: 700; color: #2E7D32; letter-spacing: 2px; margin: 10px 0; }
    .status-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .status-pending { background: #FFF3E0; color: #E65100; }
    .status-confirmed { background: #E3F2FD; color: #1565C0; }
    .status-shipped { background: #E8F5E9; color: #2E7D32; }
    .status-delivered { background: #F3E5F5; color: #7B1FA2; }
    h2 { color: #333; font-weight: 600; margin-bottom: 20px; }
    p { color: #555; line-height: 1.6; }
  </style>
</head>
<body>
  <span class="preheader">${preheader}</span>
  <div class="container">
    <div class="header">
      <h1>🍯 ${STORE_NAME}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} ${STORE_NAME}. Todos los derechos reservados.</p>
      <p>
        <a href="${STORE_URL}">Visitar tienda</a> · 
        <a href="${STORE_URL}/contact">Contacto</a>
      </p>
      <p style="margin-top: 15px; font-size: 11px; color: #666;">
        Recibiste este email porque realizaste una compra en ${STORE_NAME}.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
}

/**
 * Format date
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// =============================================
// EMAIL TYPES
// =============================================

/**
 * Order Confirmation Email
 */
export function orderConfirmationTemplate(order, items) {
  const itemsHtml = items.map(item => `
    <div class="product-row">
      <img src="${item.product_image || `${STORE_URL}/assets/img/placeholder.png`}" alt="${item.product_name}" class="product-img">
      <div class="product-info">
        <div class="product-name">${item.product_name}</div>
        <div class="product-qty">Cantidad: ${item.quantity}</div>
      </div>
      <div class="product-price">${formatCurrency(item.total_price)}</div>
    </div>
  `).join('');

  const address = order.shipping_address || {};
  
  const content = `
    <h2>¡Gracias por tu pedido! 🎉</h2>
    <p>Hola <strong>${order.customer_name}</strong>,</p>
    <p>Hemos recibido tu pedido y lo estamos preparando con mucho cariño. Te notificaremos cuando sea enviado.</p>
    
    <div class="order-box">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <div>
          <strong style="font-size: 18px;">Pedido #${order.order_number}</strong>
          <br><span style="color: #666; font-size: 14px;">${formatDate(order.created_at)}</span>
        </div>
        <span class="status-badge status-${order.status}">${translateStatus(order.status)}</span>
      </div>
      
      ${itemsHtml}
      
      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #ddd;">
        <div class="total-row">
          <span>Subtotal</span>
          <span>${formatCurrency(order.subtotal)}</span>
        </div>
        <div class="total-row">
          <span>Envío</span>
          <span>${order.shipping_cost > 0 ? formatCurrency(order.shipping_cost) : 'Gratis'}</span>
        </div>
        ${order.discount > 0 ? `
        <div class="total-row" style="color: #2E7D32;">
          <span>Descuento</span>
          <span>-${formatCurrency(order.discount)}</span>
        </div>
        ` : ''}
        <div class="total-row final">
          <span>Total</span>
          <span style="color: #C79A2A;">${formatCurrency(order.total)}</span>
        </div>
      </div>
    </div>
    
    <div class="address-box">
      <strong>📍 Dirección de envío:</strong>
      <p style="margin: 10px 0 0;">
        ${address.street || ''}<br>
        ${address.city || ''}, ${address.state || ''} ${address.postal_code || ''}<br>
        ${address.country || 'México'}
      </p>
    </div>
    
    <div style="text-align: center;">
      <a href="${STORE_URL}/track-order?order=${order.order_number}" class="btn">
        Ver estado del pedido
      </a>
    </div>
    
    <p style="text-align: center; color: #888; font-size: 14px;">
      ¿Tienes preguntas? Responde a este email o contáctanos en <a href="${STORE_URL}/contact" style="color: #C79A2A;">${STORE_URL}/contact</a>
    </p>
  `;

  return baseTemplate(content, `Tu pedido #${order.order_number} ha sido confirmado`);
}

/**
 * Shipping Confirmation Email
 */
export function shippingConfirmationTemplate(order, shipment) {
  const address = order.shipping_address || {};
  
  const content = `
    <h2>¡Tu pedido va en camino! 🚚</h2>
    <p>Hola <strong>${order.customer_name}</strong>,</p>
    <p>Excelentes noticias: tu pedido <strong>#${order.order_number}</strong> ha sido enviado y está en camino.</p>
    
    <div class="tracking-box">
      <div style="font-size: 14px; color: #666; margin-bottom: 5px;">Número de rastreo</div>
      <div class="tracking-number">${shipment.tracking_number}</div>
      <div style="font-size: 14px; color: #666;">
        Transportista: <strong>${shipment.carrier_name || shipment.carrier}</strong>
      </div>
      ${shipment.estimated_delivery ? `
      <div style="margin-top: 10px; font-size: 14px;">
        Entrega estimada: <strong>${formatDate(shipment.estimated_delivery)}</strong>
      </div>
      ` : ''}
    </div>
    
    <div style="text-align: center;">
      ${shipment.tracking_url ? `
      <a href="${shipment.tracking_url}" class="btn" target="_blank">
        Rastrear mi pedido
      </a>
      ` : `
      <a href="${STORE_URL}/track-order?tracking=${shipment.tracking_number}" class="btn">
        Rastrear mi pedido
      </a>
      `}
    </div>
    
    <div class="address-box">
      <strong>📍 Se entregará en:</strong>
      <p style="margin: 10px 0 0;">
        ${order.customer_name}<br>
        ${address.street || ''}<br>
        ${address.city || ''}, ${address.state || ''} ${address.postal_code || ''}
      </p>
    </div>
    
    <p style="color: #666; font-size: 14px;">
      <strong>Consejos para recibir tu pedido:</strong><br>
      • Asegúrate de que alguien esté disponible para recibir el paquete<br>
      • Ten a la mano una identificación oficial<br>
      • Si no hay nadie, el transportista dejará un aviso
    </p>
  `;

  return baseTemplate(content, `Tu pedido #${order.order_number} ha sido enviado - Rastreo: ${shipment.tracking_number}`);
}

/**
 * Order Delivered Email
 */
export function orderDeliveredTemplate(order) {
  const content = `
    <h2>¡Pedido entregado! 🎉</h2>
    <p>Hola <strong>${order.customer_name}</strong>,</p>
    <p>Tu pedido <strong>#${order.order_number}</strong> ha sido entregado exitosamente.</p>
    
    <div style="background: #E8F5E9; border-radius: 12px; padding: 30px; text-align: center; margin: 20px 0;">
      <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
      <div style="font-size: 20px; font-weight: 600; color: #2E7D32;">Entregado</div>
    </div>
    
    <p>Esperamos que disfrutes tu miel artesanal. Si tienes algún comentario o problema con tu pedido, no dudes en contactarnos.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <p style="font-size: 16px; margin-bottom: 15px;">¿Te gustó tu compra?</p>
      <a href="${STORE_URL}/shop" class="btn">
        Comprar de nuevo
      </a>
    </div>
    
    <p style="text-align: center; color: #888; font-size: 14px;">
      Tu opinión es muy importante para nosotros. ¡Gracias por elegirnos! 🍯
    </p>
  `;

  return baseTemplate(content, `Tu pedido #${order.order_number} ha sido entregado`);
}

/**
 * Password Reset Email
 */
export function passwordResetTemplate(user, resetToken) {
  const resetUrl = `${STORE_URL}/auth/reset-password?token=${resetToken}`;
  
  const content = `
    <h2>Restablecer contraseña</h2>
    <p>Hola <strong>${user.full_name || user.email}</strong>,</p>
    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta. Si no realizaste esta solicitud, puedes ignorar este email.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" class="btn">
        Restablecer mi contraseña
      </a>
    </div>
    
    <p style="color: #888; font-size: 14px;">
      Este enlace expirará en 1 hora por seguridad.<br>
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
      <a href="${resetUrl}" style="color: #C79A2A; word-break: break-all;">${resetUrl}</a>
    </p>
  `;

  return baseTemplate(content, 'Restablece tu contraseña');
}

/**
 * Welcome Email
 */
export function welcomeTemplate(user) {
  const content = `
    <h2>¡Bienvenido a ${STORE_NAME}! 🍯</h2>
    <p>Hola <strong>${user.full_name || 'amante de la miel'}</strong>,</p>
    <p>Gracias por crear tu cuenta. Ahora puedes disfrutar de:</p>
    
    <ul style="color: #555; line-height: 2;">
      <li>✨ Seguimiento de tus pedidos en tiempo real</li>
      <li>🎁 Ofertas exclusivas para miembros</li>
      <li>💾 Guardar tus direcciones favoritas</li>
      <li>📜 Historial de compras</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${STORE_URL}/shop" class="btn">
        Explorar productos
      </a>
    </div>
    
    <p style="text-align: center; color: #888;">
      ¿Primera vez comprando miel artesanal? <a href="${STORE_URL}/learn" style="color: #C79A2A;">Aprende más aquí</a>
    </p>
  `;

  return baseTemplate(content, `Bienvenido a ${STORE_NAME}`);
}

/**
 * Low Stock Alert (Admin)
 */
export function lowStockAlertTemplate(products) {
  const productsHtml = products.map(p => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">${p.name}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">
        <span style="color: ${p.stock_quantity <= 5 ? '#C62828' : '#F57C00'}; font-weight: 600;">
          ${p.stock_quantity}
        </span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${p.low_stock_threshold || 10}</td>
    </tr>
  `).join('');

  const content = `
    <h2>⚠️ Alerta de Stock Bajo</h2>
    <p>Los siguientes productos tienen inventario bajo y requieren atención:</p>
    
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="background: #f5f5f5;">
          <th style="padding: 12px; text-align: left;">Producto</th>
          <th style="padding: 12px; text-align: center;">Stock Actual</th>
          <th style="padding: 12px; text-align: center;">Mínimo</th>
        </tr>
      </thead>
      <tbody>
        ${productsHtml}
      </tbody>
    </table>
    
    <div style="text-align: center;">
      <a href="${STORE_URL}/admin/inventory" class="btn">
        Ver Inventario
      </a>
    </div>
  `;

  return baseTemplate(content, `Alerta: ${products.length} productos con stock bajo`);
}

// =============================================
// SEND FUNCTIONS
// =============================================

/**
 * Send email
 */
export async function sendEmail({ to, subject, html, replyTo = null }) {
  if (!isEmailConfigured) {
    console.log('📧 [EMAIL NOT SENT - Resend not configured]');
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    return { success: true, message: 'Email logged (Resend not configured)', id: 'demo' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      html: html,
      replyTo: replyTo
    });

    if (error) {
      console.error('❌ Error sending email:', error);
      throw new Error(error.message);
    }

    console.log(`✅ Email sent: ${subject} -> ${to}`);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('❌ Email error:', error);
    throw error;
  }
}

/**
 * Send order confirmation
 */
export async function sendOrderConfirmation(order, items) {
  return sendEmail({
    to: order.customer_email,
    subject: `Pedido #${order.order_number} confirmado - ${STORE_NAME}`,
    html: orderConfirmationTemplate(order, items)
  });
}

/**
 * Send shipping confirmation
 */
export async function sendShippingConfirmation(order, shipment) {
  return sendEmail({
    to: order.customer_email,
    subject: `Tu pedido #${order.order_number} ha sido enviado - ${STORE_NAME}`,
    html: shippingConfirmationTemplate(order, shipment)
  });
}

/**
 * Send order delivered notification
 */
export async function sendOrderDelivered(order) {
  return sendEmail({
    to: order.customer_email,
    subject: `Pedido #${order.order_number} entregado - ${STORE_NAME}`,
    html: orderDeliveredTemplate(order)
  });
}

/**
 * Send password reset
 */
export async function sendPasswordReset(user, resetToken) {
  return sendEmail({
    to: user.email,
    subject: `Restablecer contraseña - ${STORE_NAME}`,
    html: passwordResetTemplate(user, resetToken)
  });
}

/**
 * Send welcome email
 */
export async function sendWelcomeEmail(user) {
  return sendEmail({
    to: user.email,
    subject: `¡Bienvenido a ${STORE_NAME}! 🍯`,
    html: welcomeTemplate(user)
  });
}

/**
 * Send low stock alert to admin
 */
export async function sendLowStockAlert(products, adminEmail) {
  return sendEmail({
    to: adminEmail,
    subject: `⚠️ Alerta de Stock Bajo - ${products.length} productos`,
    html: lowStockAlertTemplate(products)
  });
}

// =============================================
// HELPERS
// =============================================

function translateStatus(status) {
  const statuses = {
    'pending': 'Pendiente',
    'confirmed': 'Confirmado',
    'processing': 'Procesando',
    'shipped': 'Enviado',
    'delivered': 'Entregado',
    'cancelled': 'Cancelado',
    'refunded': 'Reembolsado'
  };
  return statuses[status] || status;
}

export default {
  isEmailConfigured,
  sendEmail,
  sendOrderConfirmation,
  sendShippingConfirmation,
  sendOrderDelivered,
  sendPasswordReset,
  sendWelcomeEmail,
  sendLowStockAlert,
  // Templates (for preview)
  orderConfirmationTemplate,
  shippingConfirmationTemplate,
  orderDeliveredTemplate,
  passwordResetTemplate,
  welcomeTemplate,
  lowStockAlertTemplate
};
