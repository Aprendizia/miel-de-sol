-- ===========================================
-- MODHU HONEY STORE v4.0 - PREMIUM UPGRADE
-- ===========================================
-- 
-- IMPORTANTE: Este script puede ejecutarse de forma independiente.
-- Si ya tienes el schema base (v3.0), las tablas existentes se saltarán.
-- Si es una instalación nueva, ejecuta primero: schema.sql
--
-- Tablas requeridas del schema base:
--   - orders (para promotion_usages)
--   - profiles (para promotion_usages)
--
-- ===========================================

-- ===========================================
-- 0. FUNCIONES BASE REQUERIDAS
-- ===========================================

-- Extensión UUID (si no existe)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Función para updated_at (si no existe)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- 1. API KEYS (para integraciones n8n, respond.io)
-- ===========================================

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    prefix VARCHAR(20) NOT NULL,           -- Primeros 10 chars para identificar
    key_hash VARCHAR(255) NOT NULL,        -- SHA256 del key completo
    permissions TEXT[] DEFAULT '{}',       -- ['read:products', 'write:orders', etc.]
    rate_limit INTEGER DEFAULT 100,        -- Requests por minuto
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- ===========================================
-- 2. WEBHOOKS
-- ===========================================

CREATE TABLE IF NOT EXISTS webhooks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    url TEXT NOT NULL,
    secret VARCHAR(255),                   -- Para HMAC signature
    events TEXT[] NOT NULL DEFAULT '{}',   -- Eventos suscritos
    headers JSONB DEFAULT '{}',            -- Headers custom
    is_active BOOLEAN DEFAULT true,
    failure_count INTEGER DEFAULT 0,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE,
    event VARCHAR(100) NOT NULL,
    success BOOLEAN NOT NULL,
    status_code INTEGER,
    error TEXT,
    response_time INTEGER,                 -- Milliseconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON webhook_logs(created_at);

-- ===========================================
-- 3. PROMOTIONS (Sistema avanzado)
-- ===========================================

CREATE TABLE IF NOT EXISTS promotions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'flash_sale',       -- Venta relámpago con temporizador
        'bundle',           -- Paquetes/combos
        'bogo',             -- Buy One Get One
        'tiered',           -- Descuento por volumen
        'seasonal',         -- Temporadas (Navidad, etc.)
        'first_purchase',   -- Primera compra
        'loyalty',          -- Clientes recurrentes
        'cart_value'        -- Por monto de carrito
    )),
    
    -- Configuración del descuento
    discount_type VARCHAR(20) CHECK (discount_type IN ('percentage', 'fixed', 'free_product')),
    discount_value DECIMAL(10, 2) DEFAULT 0,
    
    -- Condiciones
    min_quantity INTEGER,
    min_cart_value DECIMAL(10, 2),
    required_products UUID[],              -- Productos que activan la promo
    eligible_products UUID[],              -- Productos que reciben descuento
    eligible_categories UUID[],
    
    -- Límites
    max_uses INTEGER,                      -- NULL = ilimitado
    max_uses_per_customer INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    
    -- Programación
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMP WITH TIME ZONE,
    days_of_week INTEGER[],                -- [0,1,2,3,4,5,6] = Dom-Sab
    hours_active JSONB,                    -- {"start": "10:00", "end": "20:00"}
    
    -- Estado y prioridad
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,            -- Mayor prioridad gana
    stackable BOOLEAN DEFAULT false,
    
    -- UI/Marketing
    banner_image TEXT,
    badge_text VARCHAR(50),                -- "🔥 Flash Sale", "🎁 2x1"
    landing_url TEXT,
    
    -- Configuración extra por tipo
    config JSONB DEFAULT '{}',             -- bundle_products, tiers, buy_qty, get_qty, etc.
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotion_usages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    promotion_id UUID REFERENCES promotions(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    discount_applied DECIMAL(10, 2) NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active);
CREATE INDEX IF NOT EXISTS idx_promotions_type ON promotions(type);
CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_promotion_usages_promo ON promotion_usages(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_usages_user ON promotion_usages(user_id);

-- Trigger para updated_at
CREATE TRIGGER update_promotions_updated_at
    BEFORE UPDATE ON promotions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- 4. FUNCIONES ADICIONALES
-- ===========================================

-- Función para incrementar uso de promoción
CREATE OR REPLACE FUNCTION increment_promotion_usage(p_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE promotions 
    SET current_uses = current_uses + 1
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener productos con bajo stock
CREATE OR REPLACE FUNCTION get_low_stock_products(p_threshold INTEGER DEFAULT 20)
RETURNS TABLE (
    product_id UUID,
    product_name VARCHAR,
    sku VARCHAR,
    stock_quantity INTEGER,
    low_stock_threshold INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.sku,
        p.stock_quantity,
        p.low_stock_threshold
    FROM products p
    WHERE p.is_active = true
    AND p.stock_quantity < COALESCE(p.low_stock_threshold, p_threshold)
    ORDER BY p.stock_quantity ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener resumen de inventario
CREATE OR REPLACE FUNCTION get_inventory_summary()
RETURNS TABLE (
    total_products BIGINT,
    total_units BIGINT,
    total_value DECIMAL,
    low_stock_count BIGINT,
    out_of_stock_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_products,
        COALESCE(SUM(stock_quantity), 0)::BIGINT as total_units,
        COALESCE(SUM(stock_quantity * COALESCE(cost_price, price * 0.6)), 0) as total_value,
        COUNT(*) FILTER (WHERE stock_quantity > 0 AND stock_quantity < COALESCE(low_stock_threshold, 20))::BIGINT as low_stock_count,
        COUNT(*) FILTER (WHERE stock_quantity = 0)::BIGINT as out_of_stock_count
    FROM products
    WHERE is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 5. RLS POLICIES PARA NUEVAS TABLAS
-- ===========================================

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_usages ENABLE ROW LEVEL SECURITY;

-- Solo service_role puede acceder a api_keys y webhooks
CREATE POLICY "Service role full access api_keys" ON api_keys FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access webhooks" ON webhooks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access webhook_logs" ON webhook_logs FOR ALL USING (auth.role() = 'service_role');

-- Promotions: todos pueden leer activas, solo service_role puede modificar
CREATE POLICY "Anyone can view active promotions" ON promotions FOR SELECT USING (is_active = true);
CREATE POLICY "Service role full access promotions" ON promotions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access promotion_usages" ON promotion_usages FOR ALL USING (auth.role() = 'service_role');

-- ===========================================
-- 6. AÑADIR COLUMNA promotion_id A ORDERS
-- ===========================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'promotion_id') THEN
        ALTER TABLE orders ADD COLUMN promotion_id UUID REFERENCES promotions(id) ON DELETE SET NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'promotion_discount') THEN
        ALTER TABLE orders ADD COLUMN promotion_discount DECIMAL(10, 2) DEFAULT 0;
    END IF;
END $$;

-- ===========================================
-- 7. CONFIGURACIÓN INICIAL
-- ===========================================

-- Crear tabla store_settings si no existe (del schema base)
CREATE TABLE IF NOT EXISTS store_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar configuración de integraciones
INSERT INTO store_settings (key, value, description) VALUES
    ('integrations', '{"webhooks_enabled": true, "api_rate_limit": 100, "log_retention_days": 30}', 'Configuración de integraciones'),
    ('inventory_alerts', '{"low_stock_threshold": 20, "critical_stock_threshold": 5, "email_alerts": true, "webhook_alerts": true}', 'Alertas de inventario')
ON CONFLICT (key) DO NOTHING;

-- ===========================================
-- 8. DATOS DE EJEMPLO (Opcional)
-- ===========================================

-- Promoción de ejemplo
INSERT INTO promotions (name, type, discount_type, discount_value, starts_at, ends_at, badge_text, is_active, priority)
VALUES 
    ('Flash Sale de Bienvenida', 'flash_sale', 'percentage', 15, NOW(), NOW() + INTERVAL '7 days', '🔥 -15%', true, 10)
ON CONFLICT DO NOTHING;

-- ===========================================
-- 9. LIMPIEZA DE LOGS ANTIGUOS (Función)
-- ===========================================

CREATE OR REPLACE FUNCTION cleanup_old_webhook_logs(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM webhook_logs 
    WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- INSTRUCCIONES DE VERIFICACIÓN
-- ===========================================

-- Ejecutar estas queries para verificar que todo se creó correctamente:
/*
-- Verificar tablas nuevas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('api_keys', 'webhooks', 'webhook_logs', 'promotions', 'promotion_usages');

-- Verificar funciones nuevas
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION'
AND routine_name IN ('increment_promotion_usage', 'get_low_stock_products', 'get_inventory_summary', 'cleanup_old_webhook_logs');

-- Verificar RLS
SELECT tablename, policyname FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('api_keys', 'webhooks', 'promotions');

-- Test de funciones
SELECT * FROM get_inventory_summary();
SELECT * FROM get_low_stock_products(20);
*/

-- ===========================================
-- FIN DEL UPGRADE v4.0
-- ===========================================
