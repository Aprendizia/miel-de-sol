# 📦 Guía para Ejecutar Schema Upgrade v5

Este upgrade agrega soporte completo para todos los estados de envío de Envia.com.

## Opción 1: Ejecutar en Supabase SQL Editor (Recomendado)

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **SQL Editor** en el menú lateral
3. Crea una nueva query
4. Copia y pega el contenido completo de `schema-upgrade-v5.sql`
5. Haz clic en **Run** o presiona `Cmd/Ctrl + Enter`
6. Verifica que todos los statements se ejecutaron correctamente

## Opción 2: Usar Supabase CLI

Si tienes Supabase CLI instalado:

```bash
# Instalar Supabase CLI (si no lo tienes)
npm install -g supabase

# Login
supabase login

# Link tu proyecto
supabase link --project-ref tu-project-ref

# Ejecutar el upgrade
supabase db execute -f src/database/schema-upgrade-v5.sql
```

## Opción 3: Ejecutar SQL Directo con psql

Si tienes acceso directo a la base de datos:

```bash
# Obtener connection string de Supabase Dashboard > Settings > Database
# Connection string format:
# postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

psql "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -f src/database/schema-upgrade-v5.sql
```

## Verificación Post-Upgrade

Después de ejecutar el upgrade, verifica que todo esté correcto:

```sql
-- Verificar que el constraint se actualizó
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'shipments'::regclass 
AND conname = 'shipments_status_check';

-- Verificar nuevas columnas
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'shipments' 
AND column_name IN ('envia_shipment_id', 'last_sync_at', 'delivery_attempts');

-- Verificar nuevas tablas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('shipment_events', 'envia_webhook_logs');

-- Verificar funciones
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('map_envia_status', 'update_shipment_from_envia', 'get_shipments_needing_sync');
```

## Rollback (Si es necesario)

Si necesitas revertir el upgrade:

```sql
-- Eliminar nuevas tablas
DROP TABLE IF EXISTS shipment_events CASCADE;
DROP TABLE IF EXISTS envia_webhook_logs CASCADE;

-- Eliminar nuevas columnas
ALTER TABLE shipments DROP COLUMN IF EXISTS envia_shipment_id;
ALTER TABLE shipments DROP COLUMN IF EXISTS last_sync_at;
ALTER TABLE shipments DROP COLUMN IF EXISTS sync_error;
ALTER TABLE shipments DROP COLUMN IF EXISTS delivery_attempts;
ALTER TABLE shipments DROP COLUMN IF EXISTS last_event_description;
ALTER TABLE shipments DROP COLUMN IF EXISTS last_event_location;
ALTER TABLE shipments DROP COLUMN IF EXISTS last_event_at;

-- Restaurar constraint anterior (solo estados básicos)
ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_status_check;
ALTER TABLE shipments ADD CONSTRAINT shipments_status_check CHECK (status IN (
    'pending', 'label_created', 'picked_up', 'in_transit', 
    'out_for_delivery', 'delivered', 'exception', 'returned', 'cancelled'
));

-- Eliminar funciones
DROP FUNCTION IF EXISTS map_envia_status(VARCHAR);
DROP FUNCTION IF EXISTS update_shipment_from_envia(VARCHAR, VARCHAR, TEXT, VARCHAR, TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS get_shipments_needing_sync(INTEGER);

-- Eliminar vista
DROP VIEW IF EXISTS v_shipments_dashboard;
```

## Notas Importantes

- ⚠️ Este upgrade es **NO DESTRUCTIVO**: Solo agrega columnas y tablas nuevas
- ✅ Los datos existentes en `shipments` se mantienen intactos
- ✅ Los estados existentes seguirán funcionando
- 📝 Se recomienda hacer un backup antes de ejecutar (aunque no es necesario)
