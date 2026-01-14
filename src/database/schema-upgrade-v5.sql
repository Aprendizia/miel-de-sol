-- ===========================================
-- MODHU HONEY STORE - Schema Upgrade v5
-- Mejoras en gestión de estados de envío
-- Compatible con Envia.com API
-- ===========================================

-- 1. Actualizar constraint de estados en shipments
-- Incluye todos los estados de Envia.com
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check CHECK (status IN (
    -- Estados base
    'pending',              -- Pendiente de crear guía
    'quote_requested',      -- Cotización solicitada
    'label_created',        -- Guía generada, pendiente confirmación
    'label_confirmed',      -- Guía confirmada por carrier
    'awaiting_pickup',      -- Esperando recolección
    'pickup_scheduled',     -- Recolección programada
    
    -- En tránsito
    'picked_up',            -- Recolectado por carrier
    'in_transit',           -- En tránsito
    'out_for_delivery',     -- En reparto final
    
    -- Intentos de entrega
    'delivery_attempt_1',   -- Primer intento fallido
    'delivery_attempt_2',   -- Segundo intento fallido  
    'delivery_attempt_3',   -- Tercer intento fallido
    
    -- Problemas
    'delayed',              -- Retrasado
    'exception',            -- Incidencia general
    'address_error',        -- Error de dirección
    'undeliverable',        -- No entregable
    'lost',                 -- Extraviado
    'damaged',              -- Dañado
    
    -- Finales
    'delivered',            -- Entregado exitosamente
    'returned',             -- Devuelto al remitente
    'rejected',             -- Rechazado por destinatario
    'cancelled'             -- Cancelado
));

-- 2. Agregar columnas para mejor tracking
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS envia_shipment_id VARCHAR(100);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS sync_error TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS last_event_description TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS last_event_location TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMP WITH TIME ZONE;

-- 3. Crear índice para sincronización
CREATE INDEX IF NOT EXISTS idx_shipments_last_sync ON shipments(last_sync_at);
CREATE INDEX IF NOT EXISTS idx_shipments_envia_id ON shipments(envia_shipment_id);

-- 4. Tabla para historial de eventos de envío
CREATE TABLE IF NOT EXISTS shipment_events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
    
    -- Evento
    event_status VARCHAR(50) NOT NULL,
    event_description TEXT,
    event_location VARCHAR(255),
    event_city VARCHAR(100),
    event_state VARCHAR(50),
    
    -- Metadata de Envia
    envia_event_code VARCHAR(50),
    envia_raw_response JSONB,
    
    -- Timestamps
    event_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON shipment_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_events_status ON shipment_events(event_status);
CREATE INDEX IF NOT EXISTS idx_shipment_events_at ON shipment_events(event_at DESC);

-- 5. Tabla para webhooks de Envia (logs de notificaciones recibidas)
CREATE TABLE IF NOT EXISTS envia_webhook_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    
    -- Identificadores
    tracking_number VARCHAR(100),
    carrier VARCHAR(50),
    shipment_id UUID REFERENCES shipments(id) ON DELETE SET NULL,
    
    -- Payload
    event_type VARCHAR(50),
    payload JSONB NOT NULL,
    
    -- Procesamiento
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    process_error TEXT,
    
    -- Timestamps
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_envia_webhooks_tracking ON envia_webhook_logs(tracking_number);
CREATE INDEX IF NOT EXISTS idx_envia_webhooks_processed ON envia_webhook_logs(processed);

-- 6. Función para mapear estado de Envia a estado interno
CREATE OR REPLACE FUNCTION map_envia_status(envia_status VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN CASE UPPER(envia_status)
        -- Estados iniciales
        WHEN 'CREATED' THEN 'label_created'
        WHEN 'PENDING' THEN 'awaiting_pickup'
        WHEN 'INFORMATION' THEN 'label_confirmed'
        
        -- Recolección
        WHEN 'PICKED UP' THEN 'picked_up'
        WHEN 'PICKED_UP' THEN 'picked_up'
        WHEN '1 PICKUP ATTEMPT' THEN 'awaiting_pickup'
        
        -- En tránsito
        WHEN 'SHIPPED' THEN 'in_transit'
        WHEN 'IN_TRANSIT' THEN 'in_transit'
        WHEN 'IN TRANSIT' THEN 'in_transit'
        WHEN 'OUT FOR DELIVERY' THEN 'out_for_delivery'
        WHEN 'OUT_FOR_DELIVERY' THEN 'out_for_delivery'
        
        -- Intentos de entrega
        WHEN '1 DELIVERY ATTEMPT' THEN 'delivery_attempt_1'
        WHEN '2 DELIVERY ATTEMPT' THEN 'delivery_attempt_2'
        WHEN '3 DELIVERY ATTEMPT' THEN 'delivery_attempt_3'
        
        -- Entregado
        WHEN 'DELIVERED' THEN 'delivered'
        WHEN 'PICKUP AT OFFICE' THEN 'delivered'
        WHEN 'DELIVERED AT ORIGIN' THEN 'returned'
        
        -- Problemas
        WHEN 'DELAYED' THEN 'delayed'
        WHEN 'ADDRESS ERROR' THEN 'address_error'
        WHEN 'ADDRESS_ERROR' THEN 'address_error'
        WHEN 'UNDELIVERABLE' THEN 'undeliverable'
        WHEN 'LOST' THEN 'lost'
        WHEN 'DAMAGED' THEN 'damaged'
        WHEN 'REDIRECTED' THEN 'in_transit'
        WHEN 'RETURN PROBLEM' THEN 'exception'
        WHEN 'RETURN_PROBLEM' THEN 'exception'
        
        -- Finales negativos
        WHEN 'RETURNED' THEN 'returned'
        WHEN 'REJECTED' THEN 'rejected'
        WHEN 'CANCELED' THEN 'cancelled'
        WHEN 'CANCELLED' THEN 'cancelled'
        
        -- Default
        ELSE 'exception'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 7. Función para actualizar estado de shipment y crear evento
CREATE OR REPLACE FUNCTION update_shipment_from_envia(
    p_tracking_number VARCHAR,
    p_envia_status VARCHAR,
    p_description TEXT DEFAULT NULL,
    p_location VARCHAR DEFAULT NULL,
    p_event_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS UUID AS $$
DECLARE
    v_shipment_id UUID;
    v_new_status VARCHAR;
    v_event_id UUID;
BEGIN
    -- Mapear estado
    v_new_status := map_envia_status(p_envia_status);
    
    -- Buscar shipment
    SELECT id INTO v_shipment_id
    FROM shipments
    WHERE tracking_number = p_tracking_number;
    
    IF v_shipment_id IS NULL THEN
        RAISE EXCEPTION 'Shipment not found for tracking: %', p_tracking_number;
    END IF;
    
    -- Actualizar shipment
    UPDATE shipments SET
        status = v_new_status,
        status_description = p_description,
        last_event_description = p_description,
        last_event_location = p_location,
        last_event_at = p_event_at,
        last_sync_at = NOW(),
        updated_at = NOW(),
        -- Si es entregado, marcar fecha
        delivered_at = CASE WHEN v_new_status = 'delivered' THEN p_event_at ELSE delivered_at END,
        -- Contador de intentos
        delivery_attempts = CASE 
            WHEN v_new_status LIKE 'delivery_attempt_%' 
            THEN GREATEST(delivery_attempts, CAST(RIGHT(v_new_status, 1) AS INTEGER))
            ELSE delivery_attempts 
        END
    WHERE id = v_shipment_id;
    
    -- Crear evento
    INSERT INTO shipment_events (
        shipment_id, event_status, event_description, 
        event_location, envia_event_code, event_at
    ) VALUES (
        v_shipment_id, v_new_status, p_description,
        p_location, p_envia_status, p_event_at
    ) RETURNING id INTO v_event_id;
    
    -- Si es entregado, actualizar orden
    IF v_new_status = 'delivered' THEN
        UPDATE orders SET 
            status = 'delivered',
            updated_at = NOW()
        WHERE id = (SELECT order_id FROM shipments WHERE id = v_shipment_id);
    END IF;
    
    -- Si es picked_up, actualizar orden a shipped
    IF v_new_status = 'picked_up' THEN
        UPDATE orders SET 
            status = 'shipped',
            updated_at = NOW()
        WHERE id = (SELECT order_id FROM shipments WHERE id = v_shipment_id)
        AND status IN ('processing', 'confirmed');
    END IF;
    
    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Vista para dashboard de envíos
CREATE OR REPLACE VIEW v_shipments_dashboard AS
SELECT 
    s.id,
    s.order_id,
    o.order_number,
    o.customer_name,
    o.customer_email,
    s.carrier,
    s.service,
    s.tracking_number,
    s.label_url,
    s.status,
    s.status_description,
    s.quoted_price,
    s.pickup_scheduled,
    s.pickup_date,
    s.estimated_delivery,
    s.delivered_at,
    s.delivery_attempts,
    s.last_event_description,
    s.last_event_location,
    s.last_event_at,
    s.last_sync_at,
    s.created_at,
    -- Categorización para UI
    CASE 
        WHEN s.status IN ('pending', 'quote_requested') THEN 'needs_action'
        WHEN s.status IN ('label_created', 'label_confirmed', 'awaiting_pickup', 'pickup_scheduled') THEN 'awaiting_pickup'
        WHEN s.status IN ('picked_up', 'in_transit', 'out_for_delivery') THEN 'in_transit'
        WHEN s.status LIKE 'delivery_attempt_%' THEN 'delivery_issue'
        WHEN s.status IN ('delayed', 'exception', 'address_error', 'undeliverable') THEN 'problem'
        WHEN s.status IN ('lost', 'damaged') THEN 'critical'
        WHEN s.status = 'delivered' THEN 'completed'
        WHEN s.status IN ('returned', 'rejected', 'cancelled') THEN 'closed'
        ELSE 'unknown'
    END as status_category,
    -- Tiempo desde última actualización
    EXTRACT(EPOCH FROM (NOW() - COALESCE(s.last_sync_at, s.created_at))) / 3600 as hours_since_update
FROM shipments s
JOIN orders o ON o.id = s.order_id;

-- 9. Función para obtener envíos que necesitan sincronización
CREATE OR REPLACE FUNCTION get_shipments_needing_sync(p_hours_threshold INTEGER DEFAULT 4)
RETURNS TABLE (
    shipment_id UUID,
    tracking_number VARCHAR,
    carrier VARCHAR,
    current_status VARCHAR,
    hours_since_sync NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.tracking_number,
        s.carrier,
        s.status,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(s.last_sync_at, s.created_at))) / 3600 as hours
    FROM shipments s
    WHERE s.status NOT IN ('delivered', 'returned', 'rejected', 'cancelled', 'pending')
    AND s.tracking_number IS NOT NULL
    AND (
        s.last_sync_at IS NULL 
        OR s.last_sync_at < NOW() - (p_hours_threshold || ' hours')::INTERVAL
    )
    ORDER BY hours DESC;
END;
$$ LANGUAGE plpgsql;

-- 10. Comentarios para documentación
COMMENT ON TABLE shipment_events IS 'Historial de eventos de tracking de Envia.com';
COMMENT ON TABLE envia_webhook_logs IS 'Logs de webhooks recibidos de Envia.com';
COMMENT ON FUNCTION map_envia_status IS 'Mapea estados de Envia.com a estados internos de Modhu';
COMMENT ON FUNCTION update_shipment_from_envia IS 'Actualiza shipment desde datos de Envia y crea evento';
