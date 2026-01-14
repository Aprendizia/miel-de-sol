# 🍯 Modhu Honey Store - Changelog & Development Notes

## Resumen del Proyecto

Transformación de un template HTML estático de tienda de miel en una aplicación e-commerce funcional con:
- **Backend**: Node.js + Express
- **Base de datos**: Supabase (PostgreSQL)
- **Pagos**: Stripe
- **Deploy**: Vercel (Serverless)
- **AI Images**: Google Gemini (Nano Banana)

---

## 📅 Timeline de Desarrollo

### Fase 1: Análisis y Migración de Stack
**Estado**: ✅ Completado

- Análisis del template HTML original (`modhu/`)
- Identificación de assets existentes (imágenes, CSS, fonts)
- Decisión de modernizar a Node.js + Supabase
- Creación de estructura de proyecto:
  ```
  src/
  ├── config/supabase.js
  ├── routes/
  ├── views/
  ├── services/
  └── server.js
  ```

### Fase 2: Backend con Express + EJS
**Estado**: ✅ Completado

- Setup de Express con EJS templating
- Rutas para: home, shop, product-detail, cart, checkout, auth, admin
- Demo mode para funcionar sin Supabase configurado
- Migración de HTML estático a templates EJS dinámicos

**Problemas encontrados**:
- ❌ Error `WOW is not defined` - Solucionado agregando CDN de WOW.js
- ❌ Errores de sintaxis EJS con template literals `${}` - Corregido a `<%= %>`

### Fase 3: Integración Supabase
**Estado**: ✅ Completado

- Schema de base de datos creado (`src/database/schema.sql`)
- Tablas: products, categories, orders, order_items, profiles, addresses, reviews
- Row Level Security (RLS) configurado
- Cliente Supabase con fallback a demo mode

**Problemas encontrados**:
- ❌ `new row violates row-level security policy for table "orders"` 
  - **Solución**: Usar `supabaseAdmin` con `SUPABASE_SERVICE_ROLE_KEY` para operaciones server-side

### Fase 4: Integración Stripe
**Estado**: ✅ Completado

- Checkout sessions de Stripe
- Webhooks para actualizar estado de pedidos
- Manejo de success/cancel URLs

**Problemas encontrados**:
- ❌ `The Checkout Session's total amount due must add up to at least $10.00 mxn`
  - **Solución**: Validación de monto mínimo antes de crear sesión + mensaje al usuario
- ❌ Mostrar datos de transferencia en lugar de Stripe
  - **Causa**: `STRIPE_SECRET_KEY` no estaba en Vercel
  - **Solución**: Agregar variable de entorno en Vercel dashboard

### Fase 5: UI/UX Redesign
**Estado**: ✅ Completado

- Design system con CSS variables (`variables.css`)
- Componentes premium (`components.css`)
- Animaciones (`animations.css`)
- Rediseño completo de todas las páginas
- Header minimalista con carrito flotante
- Footer elegante con newsletter

### Fase 6: Hero Épico con Parallax
**Estado**: ✅ Completado

- Parallax multi-capa con scroll
- Hexágonos flotantes animados
- Partículas con efecto twinkle
- Stats animados
- Scroll indicator interactivo
- Segunda sección showcase de productos

---

## ⚠️ Particularidades de Vercel Serverless

### 1. Sistema de Archivos Read-Only
**Problema**: No se pueden guardar archivos en el servidor.

```
❌ EROFS: read-only file system, open '/var/task/modhu/assets/img/products/product-1.png'
```

**Solución**: Para generación de imágenes con AI, se modificó para descargar directamente al navegador del usuario en lugar de guardar en servidor.

### 2. Sesiones No Persisten
**Problema**: `express-session` no funciona correctamente porque cada request puede ir a una instancia diferente.

**Síntomas**:
- Carrito se vacía al cambiar de página
- Login no persiste
- Usuario aparece como no logueado después de iniciar sesión

**Solución**: Migrar a cookies directas:

```javascript
// En lugar de req.session.cart
res.cookie('cart', JSON.stringify(cart), {
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
});

// Leer desde cookie
const cartCookie = req.cookies.cart;
if (cartCookie) {
  req.session.cart = JSON.parse(cartCookie);
}
```

### 3. Rutas de Assets Estáticos
**Problema**: CSS no cargaba en producción.

**Solución**: Configurar `vercel.json` con rutas explícitas:

```json
{
  "routes": [
    { "src": "/assets/(.*)", "dest": "/modhu/assets/$1" },
    { "src": "/css/(.*)", "dest": "/src/public/css/$1" },
    { "src": "/(.*)", "dest": "/src/server.js" }
  ]
}
```

### 4. Cold Starts
**Problema**: Primera request después de inactividad puede tardar 2-5 segundos.

**Mitigación**: 
- Mantener funciones pequeñas
- Evitar imports pesados innecesarios
- Considerar Vercel Edge Functions para rutas críticas

---

## 🔧 Variables de Entorno Requeridas

```env
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...

# App
SESSION_SECRET=tu-secreto-seguro
NODE_ENV=production
APP_URL=https://tu-dominio.vercel.app

# AI (Opcional)
GEMINI_API_KEY=AIza...
```

---

## 🐛 Bugs Conocidos y Soluciones

### Bug: Pedidos no aparecen en "Mis Pedidos"
**Causa**: RLS bloqueaba lectura de orders para usuarios autenticados.
**Solución**: 
1. Usar `supabaseAdmin` para queries de orders
2. Buscar por `user_id` O por `customer_email` para capturar pedidos de invitados

```javascript
const { data: orders } = await supabaseAdmin
  .from('orders')
  .select('*, order_items(*)')
  .or(`user_id.eq.${userId},customer_email.eq.${userEmail}`)
  .order('created_at', { ascending: false });
```

### Bug: Add to Cart no funciona
**Causa**: Form submit tradicional no funcionaba bien con SPA-like behavior.
**Solución**: Convertir a AJAX con jQuery:

```javascript
$.ajax({
  url: '/cart/add',
  method: 'POST',
  contentType: 'application/json',
  data: JSON.stringify({ productId, quantity: 1 }),
  success: function(response) {
    if (response.success) {
      $('.header__cart-count').text(response.cartCount);
    }
  }
});
```

### Bug: Generative Language API Permission Denied
**Causa**: API Key de Google Cloud en lugar de Google AI Studio.
**Solución**: Crear API Key desde https://aistudio.google.com/apikey

---

## 📁 Estructura de Assets de Imágenes

```
modhu/assets/img/
├── products/          # Productos (generadas con AI)
│   ├── product-1.png
│   ├── product-2.png
│   └── ...
├── slider/            # Hero backgrounds (generadas con AI)
│   ├── slider1.jpg
│   ├── slider2.jpg
│   └── slider3.jpg
├── testimonial/       # Fotos de clientes (generadas con AI)
├── categories/        # Iconos de categorías
├── about-us/          # Fotos del apiario
├── brand/             # Logos de partners
└── gallery/           # Galería general
```

---

## 🚀 Comandos Útiles

```bash
# Desarrollo local
npm run dev

# Producción local
npm start

# Deploy a Vercel (automático con push a main)
git push origin main

# Ver logs de Vercel
vercel logs

# Variables de entorno en Vercel
vercel env add VARIABLE_NAME
```

---

## 📊 Endpoints API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/status` | Estado de configuración |
| POST | `/cart/add` | Agregar al carrito (AJAX) |
| POST | `/cart/update` | Actualizar cantidad |
| POST | `/cart/remove` | Eliminar del carrito |
| POST | `/cart/process-checkout` | Crear orden y redirigir a Stripe |
| GET | `/cart/success` | Confirmación de pago exitoso |
| POST | `/cart/webhook` | Webhook de Stripe |
| POST | `/auth/login` | Iniciar sesión |
| POST | `/auth/register` | Registrar usuario |
| GET | `/auth/logout` | Cerrar sesión |
| GET | `/admin/api/generate-image` | Generar imagen con AI |

---

## 🎨 Design Tokens

```css
/* Colores principales */
--color-honey-gold: #C4841D;
--color-honey-light: #E5A63B;
--color-honey-dark: #9A6518;
--color-cream: #FFF8E7;

/* Tipografía */
--font-display: 'Cormorant Garamond', serif;
--font-body: 'DM Sans', sans-serif;

/* Espaciado */
--space-xs: 0.25rem;
--space-sm: 0.5rem;
--space-md: 1rem;
--space-lg: 2rem;
--space-xl: 4rem;
```

---

## 📝 TODO / Mejoras Futuras

- [ ] Implementar búsqueda de productos
- [ ] Sistema de reviews/reseñas
- [ ] Wishlist/favoritos
- [ ] Notificaciones por email (confirmación de pedido)
- [ ] Panel de administración más robusto
- [ ] Optimización de imágenes con next/image o similar
- [ ] PWA support
- [ ] Multi-idioma (EN/ES)
- [ ] Integración con servicios de envío (Estafeta, DHL)

---

## 👥 Roles de Usuario

| Rol | Acceso |
|-----|--------|
| `guest` | Ver productos, agregar al carrito, checkout como invitado |
| `customer` | Todo lo anterior + perfil, historial de pedidos |
| `admin` | Todo lo anterior + dashboard admin, gestión de productos/pedidos |

Para hacer admin a un usuario:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'tu@email.com';
```

---

## 🔐 Seguridad

- Passwords hasheados con Supabase Auth (bcrypt)
- CSRF protection pendiente
- Rate limiting pendiente
- Stripe webhooks verificados con signature
- Variables sensibles en environment variables
- RLS en Supabase para aislamiento de datos

---

*Última actualización: Enero 2026*
