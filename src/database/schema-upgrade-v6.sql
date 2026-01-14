-- ===========================================
-- MODHU HONEY STORE - Schema Upgrade v6
-- Mejoras críticas: auditoría, refunds, wishlists
-- ===========================================
-- 
-- REQUISITOS:
--   - schema.sql (tablas base)
--   - schema-upgrade-v4.sql (api_keys, webhooks, promotions)
--   - schema-upgrade-v5.sql (shipments mejorados)
--
-- Este upgrade es compatible incluso si algunas tablas opcionales no existen
-- ===========================================

-- ===========================================
-- 0. VERIFICACIÓN DE DEPENDENCIAS
-- ===========================================

DO $$ 
DECLARE
    missing_tables TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Verificar tablas críticas
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        missing_tables := array_append(missing_tables, 'orders');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        missing_tables := array_append(missing_tables, 'products');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        missing_tables := array_append(missing_tables, 'profiles');
    END IF;
    
    -- Si faltan tablas críticas, lanzar error
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'Faltan tablas críticas. Ejecuta primero schema.sql: %', array_to_string(missing_tables, ', ');
    END IF;
    
    -- Crear product_variants si no existe (estructura mínima)
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_variants') THEN
        RAISE NOTICE 'Creando tabla product_variants (estructura mínima)...';
        CREATE TABLE product_variants (
            id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
            product_id UUID REFERENCES products(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            sku VARCHAR(50),
            price DECIMAL(10, 2) NOT NULL,
            sale_price DECIMAL(10, 2),
            stock_quantity INTEGER DEFAULT 0,
            weight VARCHAR(50),
            is_default BOOLEAN DEFAULT false,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
    END IF;
END $$;

-- ===========================================
-- 1. LIMPIEZA: Remover duplicación de tracking
-- ===========================================
-- Los datos de tracking deben venir solo de shipments
-- Mantener por compatibilidad pero marcar como deprecated

COMMENT ON COLUMN orders.tracking_number IS 'DEPRECATED: Usar shipments.tracking_number';
COMMENT ON COLUMN orders.tracking_url IS 'DEPRECATED: Usar shipments.label_url';
COMMENT ON COLUMN orders.shipping_carrier IS 'DEPRECATED: Usar shipments.carrier';

-- ===========================================
-- 2. ORDER STATUS HISTORY (Auditoría)
-- ===========================================

CREATE TABLE IF NOT EXISTS order_status_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Cambio de estado
    previous_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    previous_payment_status VARCHAR(20),
    new_payment_status VARCHAR(20),
    
    -- Metadata
    changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL = sistema
    change_reason TEXT,
    notes TEXT,
    
    -- Timestamps
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_date ON order_status_history(changed_at DESC);

-- Trigger para registrar cambios automáticamente
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo registrar si cambió el estado o payment_status
    IF (OLD.status IS DISTINCT FROM NEW.status) OR 
       (OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
        INSERT INTO order_status_history (
            order_id,
            previous_status,
            new_status,
            previous_payment_status,
            new_payment_status,
            changed_by,
            change_reason
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            OLD.payment_status,
            NEW.payment_status,
            NULL, -- Por ahora, sistema. Se puede pasar user_id si está disponible
            'Status updated'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_status_change_trigger
    AFTER UPDATE ON orders
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.payment_status IS DISTINCT FROM NEW.payment_status)
    EXECUTE FUNCTION log_order_status_change();

-- ===========================================
-- 3. REFUNDS MANAGEMENT
-- ===========================================

CREATE TABLE IF NOT EXISTS refunds (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    
    -- Información del refund
    refund_number VARCHAR(20) NOT NULL UNIQUE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    reason TEXT,
    refund_type VARCHAR(20) DEFAULT 'full' CHECK (refund_type IN ('full', 'partial', 'shipping_only')),
    
    -- Estado
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled'
    )),
    
    -- Integración con Stripe
    stripe_refund_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    
    -- Items reembolsados (para refunds parciales)
    refunded_items JSONB, -- Array de {order_item_id, quantity, amount}
    
    -- Metadata
    processed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    processed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_number ON refunds(refund_number);

-- Función para generar número de refund
CREATE OR REPLACE FUNCTION generate_refund_number()
RETURNS TEXT AS $$
DECLARE
    new_number TEXT;
    year_prefix TEXT;
    sequence_num INTEGER;
BEGIN
    year_prefix := 'RF' || TO_CHAR(NOW(), 'YY');
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(refund_number FROM 5) AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM refunds
    WHERE refund_number LIKE year_prefix || '%';
    
    new_number := year_prefix || LPAD(sequence_num::TEXT, 6, '0');
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-generar número de refund
CREATE OR REPLACE FUNCTION set_refund_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.refund_number IS NULL THEN
        NEW.refund_number := generate_refund_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_refund_number_trigger
    BEFORE INSERT ON refunds
    FOR EACH ROW EXECUTE FUNCTION set_refund_number();

-- Trigger para updated_at
CREATE TRIGGER update_refunds_updated_at
    BEFORE UPDATE ON refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- 4. WISHLISTS (Listas de deseos)
-- ===========================================

CREATE TABLE IF NOT EXISTS wishlists (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name VARCHAR(100) DEFAULT 'Mi lista de deseos',
    is_public BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wishlist_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    wishlist_id UUID REFERENCES wishlists(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID, -- Foreign key se agrega después si product_variants existe
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agregar foreign key a product_variants solo si existe
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_variants') THEN
        -- Agregar constraint si no existe
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'wishlist_items_variant_id_fkey'
        ) THEN
            ALTER TABLE wishlist_items 
            ADD CONSTRAINT wishlist_items_variant_id_fkey 
            FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- Agregar unique constraint
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'wishlist_items_wishlist_product_variant_key'
    ) THEN
        ALTER TABLE wishlist_items 
        ADD CONSTRAINT wishlist_items_wishlist_product_variant_key 
        UNIQUE(wishlist_id, product_id, variant_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist ON wishlist_items(wishlist_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_product ON wishlist_items(product_id);

-- Trigger para updated_at
CREATE TRIGGER update_wishlists_updated_at
    BEFORE UPDATE ON wishlists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Función para obtener wishlist default de un usuario
CREATE OR REPLACE FUNCTION get_user_default_wishlist(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_wishlist_id UUID;
BEGIN
    SELECT id INTO v_wishlist_id
    FROM wishlists
    WHERE user_id = p_user_id
    AND is_default = true
    LIMIT 1;
    
    -- Si no existe, crear una
    IF v_wishlist_id IS NULL THEN
        INSERT INTO wishlists (user_id, name, is_default)
        VALUES (p_user_id, 'Mi lista de deseos', true)
        RETURNING id INTO v_wishlist_id;
    END IF;
    
    RETURN v_wishlist_id;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- 5. ÍNDICES FALTANTES (Performance)
-- ===========================================

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_status ON orders(created_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status) WHERE user_id IS NOT NULL;

-- Products
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at DESC);

-- Order items (solo si existe la tabla)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items') THEN
        CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
    END IF;
END $$;

-- Cart items (solo si existe la tabla)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cart_items') THEN
        CREATE INDEX IF NOT EXISTS idx_cart_items_updated ON cart_items(updated_at DESC);
    END IF;
END $$;

-- Reviews (solo si existe la tabla)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
        CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(is_approved, created_at DESC) WHERE is_approved = true;
        CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating, product_id);
    END IF;
END $$;

-- Coupons (solo si existe la tabla)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coupons') THEN
        CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active, valid_from, valid_until) WHERE is_active = true;
    END IF;
END $$;

-- Promotions (solo si existe la tabla)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'promotions') THEN
        CREATE INDEX IF NOT EXISTS idx_promotions_active_dates ON promotions(is_active, starts_at, ends_at) WHERE is_active = true;
    END IF;
END $$;

-- ===========================================
-- 6. CONSTRAINTS DE VALIDACIÓN
-- ===========================================

-- Orders
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_total_positive'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT check_total_positive CHECK (total >= 0);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_subtotal_positive'
    ) THEN
        ALTER TABLE orders ADD CONSTRAINT check_subtotal_positive CHECK (subtotal >= 0);
    END IF;
END $$;

-- Products
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_price_positive'
    ) THEN
        ALTER TABLE products ADD CONSTRAINT check_price_positive CHECK (price > 0);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_stock_non_negative'
    ) THEN
        ALTER TABLE products ADD CONSTRAINT check_stock_non_negative CHECK (stock_quantity >= 0);
    END IF;
END $$;

-- Order items
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_order_item_quantity_positive'
    ) THEN
        ALTER TABLE order_items ADD CONSTRAINT check_order_item_quantity_positive CHECK (quantity > 0);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_order_item_price_positive'
    ) THEN
        ALTER TABLE order_items ADD CONSTRAINT check_order_item_price_positive CHECK (unit_price >= 0 AND total_price >= 0);
    END IF;
END $$;

-- Refunds
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_refund_amount_positive'
    ) THEN
        ALTER TABLE refunds ADD CONSTRAINT check_refund_amount_positive CHECK (amount > 0);
    END IF;
END $$;

-- ===========================================
-- 7. VISTAS ÚTILES
-- ===========================================

-- Vista de órdenes con información completa (solo si existen las tablas necesarias)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders') THEN
        EXECUTE '
        CREATE OR REPLACE VIEW v_orders_complete AS
        SELECT 
            o.*,
            COUNT(DISTINCT oi.id) as item_count,
            COUNT(DISTINCT r.id) as refund_count,
            COALESCE(SUM(r.amount), 0) as total_refunded,
            COUNT(DISTINCT s.id) as shipment_count,
            MAX(s.tracking_number) as tracking_number,
            MAX(s.status) as shipment_status
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN refunds r ON r.order_id = o.id AND r.status = ''completed''
        LEFT JOIN shipments s ON s.order_id = o.id
        GROUP BY o.id';
    END IF;
END $$;

-- Vista de productos con estadísticas (solo si existen las tablas necesarias)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        EXECUTE '
        CREATE OR REPLACE VIEW v_products_stats AS
        SELECT 
            p.*,
            COUNT(DISTINCT oi.id) as total_orders,
            SUM(oi.quantity) as total_sold,
            SUM(oi.total_price) as total_revenue,
            AVG(r.rating) as avg_rating,
            COUNT(DISTINCT r.id) as review_count,
            COUNT(DISTINCT wi.id) as wishlist_count
        FROM products p
        LEFT JOIN order_items oi ON oi.product_id = p.id
        LEFT JOIN orders o ON o.id = oi.order_id AND o.payment_status = ''paid''
        LEFT JOIN reviews r ON r.product_id = p.id AND r.is_approved = true
        LEFT JOIN wishlist_items wi ON wi.product_id = p.id
        GROUP BY p.id';
    END IF;
END $$;

-- ===========================================
-- 8. RLS POLICIES
-- ===========================================

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

-- Order status history: usuarios ven solo sus órdenes
CREATE POLICY "Users can view their order history" ON order_status_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM orders 
            WHERE orders.id = order_status_history.order_id 
            AND orders.user_id = auth.uid()
        )
    );

-- Refunds: usuarios ven solo sus refunds
CREATE POLICY "Users can view their refunds" ON refunds FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM orders 
            WHERE orders.id = refunds.order_id 
            AND orders.user_id = auth.uid()
        )
    );

-- Wishlists: usuarios ven sus propias wishlists y las públicas
CREATE POLICY "Users can view own and public wishlists" ON wishlists FOR SELECT
    USING (user_id = auth.uid() OR is_public = true);

CREATE POLICY "Users can manage own wishlists" ON wishlists FOR ALL
    USING (user_id = auth.uid());

-- Wishlist items: usuarios ven items de sus wishlists
CREATE POLICY "Users can view own wishlist items" ON wishlist_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM wishlists 
            WHERE wishlists.id = wishlist_items.wishlist_id 
            AND wishlists.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage own wishlist items" ON wishlist_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM wishlists 
            WHERE wishlists.id = wishlist_items.wishlist_id 
            AND wishlists.user_id = auth.uid()
        )
    );

-- Service role full access
CREATE POLICY "Service role full access order_status_history" ON order_status_history FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access refunds" ON refunds FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access wishlists" ON wishlists FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access wishlist_items" ON wishlist_items FOR ALL
    USING (auth.role() = 'service_role');

-- ===========================================
-- 9. COMENTARIOS DE DOCUMENTACIÓN
-- ===========================================

COMMENT ON TABLE order_status_history IS 'Historial de cambios de estado de órdenes para auditoría';
COMMENT ON TABLE refunds IS 'Gestión de reembolsos y devoluciones';
COMMENT ON TABLE wishlists IS 'Listas de deseos de usuarios';
COMMENT ON TABLE wishlist_items IS 'Items en listas de deseos';
COMMENT ON VIEW v_orders_complete IS 'Vista de órdenes con información agregada';
COMMENT ON VIEW v_products_stats IS 'Vista de productos con estadísticas de ventas';

-- ===========================================
-- 10. VERIFICACIÓN
-- ===========================================

-- Ejecutar estas queries para verificar:
/*
-- Verificar nuevas tablas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('order_status_history', 'refunds', 'wishlists', 'wishlist_items');

-- Verificar triggers
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_name IN ('order_status_change_trigger', 'set_refund_number_trigger');

-- Verificar índices
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('orders', 'products', 'order_items')
AND indexname LIKE 'idx_%';

-- Test de funciones
SELECT get_user_default_wishlist('user-uuid-here');
*/

-- ===========================================
-- FIN DEL UPGRADE v6.0
-- ===========================================
