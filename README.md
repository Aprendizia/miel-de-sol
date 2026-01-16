# 🍯 Miel de Sol - Honey Store

Tienda en línea premium de miel artesanal mexicana con panel de administración, sistema de inventario, gestión de envíos, emails transaccionales, y API para integraciones externas.

![Version](https://img.shields.io/badge/version-5.0.0-gold)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)

**Live**: [https://mieldesol.com](https://mieldesol.com)

---

## 🚀 Stack Tecnológico

| Capa | Tecnología | Notas |
|------|------------|-------|
| **Runtime** | Node.js 18+ | ES Modules (`type: "module"`) |
| **Framework** | Express 4.x | `src/server.js` es entry point |
| **Base de Datos** | Supabase (PostgreSQL 15) | RLS habilitado |
| **Pagos** | Stripe Checkout | Webhooks para confirmación |
| **Envíos** | Envia.com | Cotizaciones, guías, rastreo |
| **Emails** | Resend | Transaccionales y marketing |
| **Templates** | EJS | En `src/views/` |
| **Hosting** | Vercel (Serverless) | ⚠️ Limitaciones importantes |
| **IA** | Google Gemini | Generación de imágenes |

---

## 📦 Instalación Rápida

```bash
git clone https://github.com/Aprendizia/miel-de-sol.git
cd miel-de-sol
npm install
cp env.example .env
# Editar .env con credenciales
npm run dev
# → http://localhost:3000
```

### Modo Demo (Sin Supabase)
Si no tienes credenciales de Supabase, la app funciona en **demo mode** con datos estáticos de `src/data/demo-data.js`.

---

## ⚠️ IMPORTANTE: Particularidades de Vercel Serverless

### 1. Sistema de Archivos Read-Only
```
❌ EROFS: read-only file system
```
**No se pueden guardar archivos en el servidor.** Las imágenes generadas con AI se descargan al navegador del usuario.

### 2. Sesiones NO Persisten
`express-session` NO funciona porque cada request va a una instancia diferente.

**Solución implementada:** Cookies directas para cart y user:

```javascript
// src/server.js - Cart en cookies
res.cookie('cart', JSON.stringify(cart), {
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
});

// User session en cookie
res.cookie('user_session', JSON.stringify({
  id: user.id,
  email: user.email,
  role: user.role,
  full_name: user.full_name
}), { ... });
```

### 3. Assets Estáticos
Configurado en `vercel.json`:
```json
{
  "routes": [
    { "src": "/assets/(.*)", "dest": "/modhu/assets/$1" },
    { "src": "/css/(.*)", "dest": "/src/public/css/$1" },
    { "src": "/(.*)", "dest": "/src/server.js" }
  ]
}
```

---

## 🔧 Variables de Entorno

```env
# ============================================
# SUPABASE
# ============================================
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...              # Para operaciones públicas
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # ⚠️ REQUERIDO para bypass RLS

# ============================================
# STRIPE
# ============================================
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...         # ⚠️ Sin esto, muestra transferencia
STRIPE_WEBHOOK_SECRET=whsec_...       # Para verificar webhooks

# ============================================
# ENVÍOS (Envia.com)
# ============================================
ENVIA_API_KEY=tu-api-key
ENVIA_ORIGIN_POSTAL_CODE=91000
ENVIA_ORIGIN_CITY=Xalapa
ENVIA_ORIGIN_STATE=VE
ENVIA_ORIGIN_COUNTRY=MX

# ============================================
# EMAILS (Resend)
# ============================================
RESEND_API_KEY=re_...
EMAIL_FROM=hola@mieldesol.com

# ============================================
# APP
# ============================================
APP_URL=https://tu-dominio.vercel.app # URL de producción
SESSION_SECRET=string-seguro-32-chars
NODE_ENV=production

# ============================================
# GEMINI AI (Opcional)
# ============================================
GEMINI_API_KEY=AIza...                # Desde aistudio.google.com
```

### Configurar en Vercel
```bash
vercel env add SUPABASE_URL
vercel env add STRIPE_SECRET_KEY
vercel env add ENVIA_API_KEY
vercel env add RESEND_API_KEY
# etc...
```

---

## 🗄️ Estructura de Base de Datos

### Tablas Core

| Tabla | Descripción | RLS |
|-------|-------------|-----|
| `profiles` | Usuarios (extends auth.users) | ✅ |
| `products` | Catálogo de productos | ✅ |
| `categories` | Categorías | ✅ |
| `product_variants` | Variantes (tamaños) | - |
| `orders` | Pedidos | ✅ |
| `order_items` | Items de pedido | ✅ |
| `order_status_history` | Historial de estados | ✅ |
| `cart_items` | Carrito (usuarios logueados) | ✅ |
| `addresses` | Direcciones de envío | ✅ |
| `reviews` | Reseñas | ✅ |

### Tablas de Envíos

| Tabla | Descripción |
|-------|-------------|
| `shipments` | Guías de envío (22+ estados) |
| `shipment_events` | Historial de tracking |
| `envia_webhook_logs` | Logs de webhooks Envia.com |

### Tablas Auxiliares

| Tabla | Descripción |
|-------|-------------|
| `coupons` | Cupones de descuento |
| `coupon_usages` | Uso de cupones |
| `promotions` | Promociones automáticas |
| `refunds` | Reembolsos |
| `wishlists` | Listas de deseos |
| `wishlist_items` | Items de wishlist |
| `shipping_zones` | Zonas de envío |
| `shipping_rates` | Tarifas por zona |
| `inventory_movements` | Historial de stock |
| `newsletter_subscribers` | Suscriptores |
| `store_settings` | Configuración (JSON) |
| `api_keys` | Keys de API externa |
| `webhooks` | Configuración webhooks |
| `activity_logs` | Logs de actividad |

### Schema SQL
```bash
# Ejecutar en Supabase SQL Editor en este orden:
1. src/database/schema.sql            # Schema base
2. src/database/schema-upgrade-v4.sql # Funciones adicionales
3. src/database/schema-upgrade-v5.sql # Envíos avanzados (22+ estados)
4. src/database/schema-upgrade-v6.sql # Wishlists, refunds, historial
```

### Funciones SQL Disponibles
```sql
-- Generar número de orden
SELECT generate_order_number();  -- → '260001'

-- Stats de ventas
SELECT * FROM get_sales_stats(30);  -- últimos 30 días

-- Productos más vendidos
SELECT * FROM get_top_products(10);

-- Validar cupón
SELECT * FROM validate_coupon('CODIGO', user_id, subtotal);

-- Decrementar stock
SELECT decrement_stock(product_id, quantity);

-- Mapear estado de Envia.com
SELECT map_envia_status('delivered'); -- → 'delivered'

-- Actualizar envío desde Envia.com
SELECT update_shipment_from_envia(shipment_id, 'in_transit', 'desc', 'envia_code');
```

### Vistas SQL

| Vista | Descripción |
|-------|-------------|
| `v_shipments_dashboard` | Envíos con info de orden |
| `v_orders_complete` | Órdenes con totales y envíos |
| `v_products_stats` | Productos con estadísticas |

### Row Level Security (RLS)
⚠️ **IMPORTANTE**: Usar `supabaseAdmin` para operaciones server-side que necesiten bypass RLS.

```javascript
// src/config/supabase.js
import { createClient } from '@supabase/supabase-js';

// Cliente público (respeta RLS)
export const supabase = createClient(url, anonKey);

// Cliente admin (bypass RLS) - SOLO en server
export const supabaseAdmin = createClient(url, serviceRoleKey);
```

---

## 📁 Estructura del Proyecto

```
src/
├── server.js                 # Entry point Express
├── config/
│   └── supabase.js          # Clientes Supabase (admin + público)
├── data/
│   └── demo-data.js         # Datos para modo demo
├── database/
│   ├── schema.sql           # Schema PostgreSQL completo
│   ├── schema-upgrade-v4.sql
│   ├── schema-upgrade-v5.sql # Estados de envío avanzados
│   ├── schema-upgrade-v6.sql # Wishlists, refunds, historial
│   ├── UPGRADE-V5-GUIDE.md
│   └── SCHEMA-ANALYSIS.md   # Análisis y roadmap
├── middleware/
│   ├── api-auth.js          # Auth para API externa
│   └── security.js          # CSP, rate limit, etc.
├── routes/
│   ├── index.js             # GET /, /about, /contact, /track-order
│   ├── shop.js              # GET /shop, /shop/product/:slug
│   ├── cart.js              # /cart/*, /cart/process-checkout
│   ├── auth.js              # /auth/login, /register, /profile
│   ├── admin.js             # /admin/* (requiere role=admin)
│   ├── shipping.js          # /api/shipping/* + webhook Envia
│   ├── api.js               # /api/status (interno)
│   └── api-v1.js            # /api/v1/* (externo con API key)
├── services/
│   ├── stripe.js            # createCheckoutSession, handleWebhook
│   ├── envia.js             # Cotizaciones, guías, rastreo
│   ├── email.js             # Emails transaccionales (Resend)
│   ├── coupons.js           # Gestión de cupones
│   ├── inventory.js         # Movimientos de inventario
│   ├── promotions.js        # Promociones automáticas
│   ├── reports.js           # Reportes y estadísticas
│   ├── seo.js               # Meta tags dinámicos
│   └── imageGenerator.js    # Gemini AI
├── views/
│   ├── layouts/main.ejs
│   ├── partials/
│   │   ├── header.ejs
│   │   ├── footer.ejs
│   │   ├── admin-sidebar.ejs
│   │   ├── admin-header.ejs
│   │   ├── admin-styles.ejs  # Tema light premium
│   │   └── admin-scripts.ejs
│   ├── pages/
│   │   ├── home.ejs
│   │   ├── shop.ejs
│   │   ├── product-detail.ejs
│   │   ├── cart.ejs
│   │   ├── checkout.ejs
│   │   ├── order-confirmation.ejs
│   │   ├── about.ejs
│   │   ├── contact.ejs
│   │   ├── learn.ejs
│   │   ├── track-order.ejs
│   │   └── auth/
│   ├── admin/
│   │   ├── dashboard.ejs
│   │   ├── products.ejs
│   │   ├── product-form.ejs
│   │   ├── categories.ejs
│   │   ├── orders.ejs
│   │   ├── order-detail.ejs
│   │   ├── users.ejs
│   │   ├── inventory.ejs
│   │   ├── coupons.ejs
│   │   ├── promotions.ejs
│   │   ├── shipments.ejs     # Gestión de envíos
│   │   ├── mailing.ejs       # Gestión de emails
│   │   ├── reports.ejs
│   │   ├── images.ejs
│   │   ├── integrations.ejs
│   │   └── settings.ejs
│   └── errors/
└── public/
    ├── css/
    │   ├── variables.css
    │   ├── components.css
    │   ├── premium.css
    │   ├── brand.css
    │   └── animations.css
    └── manifest.json
```

---

## 🛣️ Rutas y Endpoints

### Páginas Públicas (GET)

| Ruta | Archivo | Descripción |
|------|---------|-------------|
| `/` | `routes/index.js` | Home con hero parallax |
| `/shop` | `routes/shop.js` | Catálogo con filtros |
| `/shop/product/:slug` | `routes/shop.js` | Detalle de producto |
| `/about` | `routes/index.js` | Sobre nosotros |
| `/contact` | `routes/index.js` | Contacto |
| `/learn` | `routes/index.js` | Blog/educación |
| `/track-order` | `routes/index.js` | Buscar pedido |

### Carrito (routes/cart.js)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/cart` | Ver carrito |
| POST | `/cart/add` | Agregar (AJAX, retorna JSON) |
| POST | `/cart/update` | Actualizar cantidad |
| POST | `/cart/remove` | Eliminar item |
| GET | `/cart/checkout` | Formulario de envío |
| POST | `/cart/process-checkout` | Crear orden → Stripe |
| GET | `/cart/success` | Confirmación exitosa |
| GET | `/cart/cancel` | Pago cancelado |
| POST | `/cart/webhook` | Webhook de Stripe |

### Admin (routes/admin.js)
**Requiere**: `req.session.user.role === 'admin'`

| Ruta | Descripción |
|------|-------------|
| `/admin` | Dashboard con métricas |
| `/admin/products` | Gestión de productos |
| `/admin/categories` | Gestión de categorías |
| `/admin/orders` | Gestión de pedidos |
| `/admin/users` | Gestión de usuarios |
| `/admin/inventory` | Control de stock |
| `/admin/coupons` | Cupones de descuento |
| `/admin/promotions` | Promociones automáticas |
| `/admin/shipments` | **Gestión de envíos** |
| `/admin/mailing` | **Gestión de emails** |
| `/admin/reports` | Reportes y gráficas |
| `/admin/images` | Generador de imágenes AI |
| `/admin/integrations` | API keys y webhooks |
| `/admin/settings` | Configuración |

### Envíos (routes/shipping.js)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/shipping/quote` | Cotizar envío |
| POST | `/api/shipping/label` | Generar guía |
| GET | `/api/shipping/track/:tracking` | Rastrear envío |
| POST | `/api/shipping/pickup` | Programar recolección |
| DELETE | `/api/shipping/cancel/:labelId` | Cancelar guía |
| POST | `/api/shipping/webhook/envia` | Webhook de Envia.com |

### API Externa v1 (routes/api-v1.js)
**Requiere**: Header `X-API-Key`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/products` | Lista productos |
| GET | `/api/v1/products/:id` | Detalle producto |
| GET | `/api/v1/orders` | Lista pedidos |
| PUT | `/api/v1/orders/:id/status` | Actualizar estado |
| GET | `/api/v1/inventory` | Resumen inventario |
| POST | `/api/v1/inventory/:id/adjust` | Ajustar stock |

---

## 📦 Integración Envia.com (Envíos)

### Estados de Envío Soportados (22+)

```
pending → quote_requested → label_created → label_confirmed → 
awaiting_pickup → pickup_scheduled → picked_up → in_transit → 
out_for_delivery → delivery_attempt_1/2/3 → delivered

Excepciones: delayed, exception, address_error, undeliverable, 
             lost, damaged, returned, rejected, cancelled
```

### Servicio: `src/services/envia.js`

```javascript
import { 
  getShippingQuotes, 
  createShippingLabel, 
  trackShipment,
  syncMultipleShipments 
} from '../services/envia.js';

// Cotizar envío
const quotes = await getShippingQuotes(destination, packages);

// Crear etiqueta
const result = await createShippingLabel({
  destination,
  packages,
  carrier: 'estafeta',
  serviceId: 'ground',
  orderId,
  orderNumber
});

// Rastrear (mapea estados automáticamente)
const tracking = await trackShipment(trackingNumber, carrier);
// → { status: 'in_transit', statusCategory: 'active', isFinal: false, ... }

// Sincronizar múltiples
const results = await syncMultipleShipments(shipmentIds);
```

### Webhook de Envia.com

Endpoint: `POST /api/shipping/webhook/envia`

```javascript
// Recibe notificaciones automáticas de Envia.com
// Actualiza shipments y orders automáticamente
// Registra eventos en shipment_events
```

### Carriers Soportados
- Estafeta
- FedEx
- DHL Express
- Redpack
- Paquete Express
- 99 Minutos

### Reglas Operativas (Envíos Admin)
- Solo pedidos con `payment_status = paid` aparecen en **Por enviar**.
- La guía crea un registro en `shipments` con estado `label_created`.
- Un pedido pasa a `shipped` solo cuando el carrier confirma recolección.
- Si se ingresa tracking manualmente, el envío se crea **solo** si la orden tiene `shipping_carrier`.

---

## 📧 Integración Resend (Emails)

### Servicio: `src/services/email.js`

```javascript
import { 
  sendOrderConfirmation,
  sendShippingNotification,
  sendPasswordReset,
  sendWelcomeEmail,
  sendTestEmail
} from '../services/email.js';

// Confirmación de orden
await sendOrderConfirmation(order);

// Notificación de envío
await sendShippingNotification(order, shipment);

// Email de prueba (admin)
await sendTestEmail('test@email.com');
```

### Templates Disponibles
- `order-confirmation` - Confirmación de compra
- `shipping-notification` - Envío en camino
- `delivery-confirmation` - Entregado
- `password-reset` - Recuperar contraseña
- `welcome` - Bienvenida a nuevo usuario

---

## 💳 Integración Stripe

### Flujo de Checkout
```
1. Usuario llena formulario de envío
2. POST /cart/process-checkout
3. Se crea orden en Supabase (status: pending)
4. Se crea Stripe Checkout Session
5. Redirect a Stripe
6. Usuario paga
7. Stripe envía webhook
8. Se actualiza orden (status: paid)
9. Se envía email de confirmación
10. Redirect a /cart/success
```

### Monto Mínimo
Stripe requiere **mínimo $10 MXN**. Hay validación antes de crear sesión.

---

## 🎨 Design System

### CSS Variables (src/public/css/variables.css)
```css
:root {
  /* Colores - Miel de Sol */
  --ivory: #F6F1E6;      /* Fondo principal */
  --charcoal: #141414;   /* Texto principal */
  --gold: #C79A2A;       /* Accent, CTAs */
  --amber: #A56B1F;      /* Hover states */
  --sand: #E8DDC8;       /* Cards, borders */
  --smoke: #6B6B6B;      /* Texto secundario */
  --night: #0F2437;      /* Fondo oscuro */
  --white: #FFFFFF;
  
  /* Tipografía */
  --font-display: 'Cormorant Garamond', serif;  /* Headlines */
  --font-body: 'Inter', sans-serif;             /* Body/UI */
  
  /* Layout */
  --max: 1160px;
  --radius: 16px;
  --radius-sm: 8px;
  --radius-lg: 20px;
  --radius-pill: 999px;
  
  /* Sombras */
  --shadow-soft: 0 12px 30px rgba(20,20,20,.06);
  --shadow-card: 0 4px 20px rgba(20,20,20,.04);
  --shadow-hover: 0 16px 40px rgba(20,20,20,.08);
}
```

### Admin Theme (Light Premium)
El panel de administración usa un tema claro premium con:
- Sidebar oscuro (#2C2416) para contraste
- Cards con sombras sutiles
- Badges de colores para estados
- Tipografía Cormorant Garamond + Inter

---

## 🐛 Problemas Conocidos y Soluciones

### 1. Carrito se vacía al cambiar página
**Causa**: Sessions no persisten en Vercel
**Solución**: Usar cookies (ya implementado)

### 2. Pedidos no aparecen en producción
**Causa**: RLS bloqueaba queries
**Solución**: Usar `supabaseAdmin` + buscar por email

### 3. Gráficas de reportes no renderizan
**Causa**: JSON mal formateado en EJS
**Solución**: Usar `<%- JSON.stringify() %>` sin doble escape

### 4. Favicon 404
**Causa**: Referencias a archivos locales
**Solución**: Usar emoji SVG inline

### 5. Pedido no aparece en “Por enviar”
**Causa**: El pedido no está pagado o ya tiene shipment activo
**Solución**: Confirmar `payment_status = paid` y revisar envíos vinculados

---

## 📝 Comandos de Desarrollo

```bash
# Desarrollo local
npm run dev

# Producción local
npm start

# Deploy (automático con push)
git push origin main

# Deploy manual
vercel --prod

# Logs
vercel logs --follow
```

---

## 🔄 Git Workflow

### Convención de Commits
- ✨ `Add:` Nueva funcionalidad
- 🐛 `Fix:` Corrección de bug
- 📝 `Docs:` Documentación
- 🎨 `Style:` UI/CSS
- ♻️ `Refactor:` Refactorización
- 🔧 `Config:` Configuración

---

## 📊 Debugging

### Endpoint de Status
```bash
curl https://tu-dominio.vercel.app/api/status
```

Respuesta:
```json
{
  "success": true,
  "environment": "production",
  "supabase": { "configured": true, "mode": "production" },
  "stripe": { "configured": true },
  "envia": { "configured": true },
  "resend": { "configured": true }
}
```

---

## 📄 Licencia

MIT © 2026 Miel de Sol

---

## 🆘 Soporte

- 📖 Ver `CHANGELOG.md` para historial detallado
- 📖 Ver `docs/IMAGE_GENERATION_GUIDE.md` para prompts de AI
- 📖 Ver `src/database/SCHEMA-ANALYSIS.md` para roadmap de BD
- 🐛 Issues: GitHub Issues

---

*Hecho con 🍯 en México*
