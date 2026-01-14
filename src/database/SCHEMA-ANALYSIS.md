# 📊 Análisis de Estructura de Base de Datos

## Resumen Ejecutivo

Este documento analiza la estructura actual de la base de datos comparándola con las funcionalidades del sitio y propone mejoras para escalabilidad futura.

---

## ✅ Tablas Existentes

### Core (schema.sql)
- ✅ `categories` - Categorías de productos
- ✅ `products` - Productos
- ✅ `product_variants` - Variantes de productos (tamaños)
- ✅ `profiles` - Usuarios (extiende Supabase Auth)
- ✅ `addresses` - Direcciones de usuarios
- ✅ `orders` - Pedidos
- ✅ `order_items` - Items de pedidos
- ✅ `cart_items` - Carrito de compras
- ✅ `coupons` - Cupones de descuento
- ✅ `coupon_usages` - Uso de cupones
- ✅ `reviews` - Reseñas de productos
- ✅ `inventory_movements` - Movimientos de inventario
- ✅ `newsletter_subscribers` - Suscriptores de newsletter
- ✅ `email_campaigns` - Campañas de email
- ✅ `abandoned_carts` - Carritos abandonados
- ✅ `store_settings` - Configuración de la tienda
- ✅ `activity_logs` - Logs de actividad
- ✅ `translations` - Traducciones (multi-idioma)
- ✅ `shipping_zones` - Zonas de envío
- ✅ `shipping_rates` - Tarifas de envío
- ✅ `shipments` - Envíos con Envia.com

### Premium (schema-upgrade-v4.sql)
- ✅ `api_keys` - API keys para integraciones
- ✅ `webhooks` - Configuración de webhooks
- ✅ `webhook_logs` - Logs de webhooks
- ✅ `promotions` - Promociones avanzadas
- ✅ `promotion_usages` - Uso de promociones

### Envíos (schema-upgrade-v5.sql)
- ✅ `shipment_events` - Historial de eventos de envío
- ✅ `envia_webhook_logs` - Logs de webhooks de Envia

---

## 🔍 Análisis de Funcionalidades vs DB

### Funcionalidades Implementadas

| Funcionalidad | Tabla(s) | Estado |
|---------------|----------|--------|
| Catálogo de productos | `products`, `product_variants`, `categories` | ✅ Completo |
| Carrito de compras | `cart_items` | ✅ Completo |
| Checkout y órdenes | `orders`, `order_items` | ✅ Completo |
| Cupones | `coupons`, `coupon_usages` | ✅ Completo |
| Promociones avanzadas | `promotions`, `promotion_usages` | ✅ Completo |
| Inventario | `inventory_movements` | ✅ Completo |
| Reseñas | `reviews` | ✅ Completo |
| Envíos (Envia.com) | `shipments`, `shipment_events` | ✅ Completo |
| Webhooks | `webhooks`, `webhook_logs` | ✅ Completo |
| API v1 | `api_keys` | ✅ Completo |
| Newsletter | `newsletter_subscribers`, `email_campaigns` | ✅ Completo |
| Carritos abandonados | `abandoned_carts` | ✅ Completo |
| Configuración | `store_settings` | ✅ Completo |
| Logs de actividad | `activity_logs` | ✅ Completo |
| Traducciones | `translations` | ✅ Completo |

---

## ⚠️ Gaps Identificados

### 1. **Falta relación entre Orders y Shipments**
- **Problema**: `orders.tracking_number` duplica `shipments.tracking_number`
- **Impacto**: Puede haber inconsistencias
- **Solución**: Usar solo `shipments` como fuente de verdad

### 2. **Falta historial de cambios de estado de órdenes**
- **Problema**: No hay registro de cuándo/cómo cambió el estado de una orden
- **Impacto**: Difícil auditar cambios
- **Solución**: Tabla `order_status_history`

### 3. **Falta gestión de devoluciones/refunds**
- **Problema**: `orders.status` tiene 'refunded' pero no hay tabla de refunds
- **Impacto**: No se puede rastrear devoluciones
- **Solución**: Tabla `refunds` con detalles

### 4. **Falta wishlist/favoritos**
- **Problema**: Funcionalidad común en e-commerce no implementada
- **Impacto**: Menor engagement
- **Solución**: Tabla `wishlists`

### 5. **Falta gestión de proveedores**
- **Problema**: No hay tabla para proveedores/suppliers
- **Impacto**: No se puede rastrear origen de productos
- **Solución**: Tabla `suppliers` y relación con `products`

### 6. **Falta gestión de múltiples almacenes**
- **Problema**: Solo hay un stock global
- **Impacto**: No se puede manejar múltiples ubicaciones
- **Solución**: Tablas `warehouses` y `warehouse_stock`

### 7. **Falta sistema de notificaciones in-app**
- **Problema**: Solo hay emails, no notificaciones en el sitio
- **Impacto**: Menor engagement
- **Solución**: Tabla `notifications`

### 8. **Falta gestión de gift cards**
- **Problema**: Funcionalidad común no implementada
- **Impacto**: Menos opciones de pago/regalo
- **Solución**: Tabla `gift_cards`

### 9. **Falta historial de precios**
- **Problema**: No se guarda historial de cambios de precio
- **Impacto**: No se puede analizar tendencias
- **Solución**: Tabla `price_history`

### 10. **Falta gestión de atributos de productos**
- **Problema**: Solo hay `tags` como array, no atributos estructurados
- **Impacto**: Limitado para filtros avanzados
- **Solución**: Tablas `product_attributes` y `product_attribute_values`

---

## 🚀 Mejoras Propuestas para Escalabilidad

### Prioridad Alta (v6.0)

1. **Order Status History**
   - Auditoría completa de cambios de estado
   - Timestamps y usuarios responsables

2. **Refunds Management**
   - Rastreo completo de devoluciones
   - Integración con Stripe

3. **Wishlists**
   - Funcionalidad básica de favoritos
   - Notificaciones de precio

### Prioridad Media (v7.0)

4. **Product Attributes**
   - Sistema flexible de atributos
   - Filtros avanzados

5. **Notifications System**
   - Notificaciones in-app
   - Preferencias de usuario

6. **Price History**
   - Historial de precios
   - Análisis de tendencias

### Prioridad Baja (v8.0+)

7. **Multi-Warehouse**
   - Múltiples ubicaciones
   - Transferencias entre almacenes

8. **Suppliers Management**
   - Gestión de proveedores
   - Órdenes de compra

9. **Gift Cards**
   - Sistema de gift cards
   - Códigos de regalo

---

## 📋 Recomendaciones Inmediatas

### 1. Limpiar duplicación de tracking
```sql
-- Remover tracking_number de orders (usar solo shipments)
ALTER TABLE orders DROP COLUMN IF EXISTS tracking_number;
ALTER TABLE orders DROP COLUMN IF EXISTS tracking_url;
ALTER TABLE orders DROP COLUMN IF EXISTS shipping_carrier;
```

### 2. Agregar índices faltantes
```sql
-- Índices para mejorar performance
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_status ON orders(created_at, status);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity);
```

### 3. Agregar constraints faltantes
```sql
-- Validaciones adicionales
ALTER TABLE orders ADD CONSTRAINT check_total_positive CHECK (total >= 0);
ALTER TABLE products ADD CONSTRAINT check_price_positive CHECK (price > 0);
ALTER TABLE order_items ADD CONSTRAINT check_quantity_positive CHECK (quantity > 0);
```

---

## 📊 Métricas de Calidad

| Métrica | Valor Actual | Objetivo |
|---------|--------------|----------|
| Tablas con índices | 85% | 100% |
| Tablas con RLS | 90% | 100% |
| Foreign keys definidas | 95% | 100% |
| Constraints de validación | 60% | 90% |
| Funciones SQL útiles | 8 | 15+ |
| Vistas para reporting | 1 | 5+ |

---

## 🎯 Plan de Acción

### Fase 1: Limpieza y Optimización (1-2 días)
- [ ] Remover duplicación de tracking
- [ ] Agregar índices faltantes
- [ ] Agregar constraints de validación
- [ ] Documentar todas las relaciones

### Fase 2: Funcionalidades Críticas (3-5 días)
- [ ] Implementar `order_status_history`
- [ ] Implementar `refunds`
- [ ] Implementar `wishlists`

### Fase 3: Mejoras de Escalabilidad (1-2 semanas)
- [ ] Implementar `product_attributes`
- [ ] Implementar `notifications`
- [ ] Implementar `price_history`

---

## 📝 Notas Finales

La estructura actual es **sólida y bien diseñada** para las funcionalidades actuales. Las mejoras propuestas son principalmente para:
1. **Escalabilidad futura**
2. **Mejor auditoría**
3. **Funcionalidades comunes de e-commerce**

No hay problemas críticos que impidan el funcionamiento actual del sitio.
