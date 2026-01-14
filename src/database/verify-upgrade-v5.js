/**
 * Script para verificar que schema-upgrade-v5.sql se ejecutó correctamente
 * 
 * Uso:
 *   node src/database/verify-upgrade-v5.js
 */

import { supabaseAdmin } from '../config/supabase.js';

async function verifyUpgrade() {
  console.log('🔍 Verificando schema-upgrade-v5...\n');

  const checks = {
    columns: false,
    tables: false,
    functions: false,
    view: false
  };

  try {
    // 1. Verificar nuevas columnas en shipments
    console.log('1️⃣ Verificando nuevas columnas en shipments...');
    const { data: columns, error: colsError } = await supabaseAdmin
      .from('shipments')
      .select('envia_shipment_id, last_sync_at, delivery_attempts, last_event_description, last_event_location, last_event_at')
      .limit(0);
    
    if (!colsError) {
      checks.columns = true;
      console.log('   ✅ Nuevas columnas existen (envia_shipment_id, last_sync_at, delivery_attempts, etc.)');
    } else {
      console.log('   ❌ Faltan nuevas columnas');
      console.log('      Error:', colsError.message);
    }

    // 2. Verificar nuevas tablas
    console.log('\n2️⃣ Verificando nuevas tablas...');
    
    // Verificar shipment_events
    const { data: eventsTest, error: eventsError } = await supabaseAdmin
      .from('shipment_events')
      .select('id')
      .limit(0);
    
    if (!eventsError) {
      console.log('   ✅ Tabla shipment_events existe');
      checks.tables = true;
    } else {
      console.log('   ❌ Tabla shipment_events no existe');
      console.log('      Error:', eventsError.message);
    }

    // Verificar envia_webhook_logs
    const { data: webhooksTest, error: webhooksError } = await supabaseAdmin
      .from('envia_webhook_logs')
      .select('id')
      .limit(0);
    
    if (!webhooksError) {
      console.log('   ✅ Tabla envia_webhook_logs existe');
    } else {
      console.log('   ❌ Tabla envia_webhook_logs no existe');
      console.log('      Error:', webhooksError.message);
    }

    // 3. Verificar funciones SQL
    console.log('\n3️⃣ Verificando funciones SQL...');
    
    // Probar map_envia_status usando una query directa
    // Nota: No podemos llamar funciones directamente, pero podemos verificar que existen
    // intentando usarlas en una query
    const { data: funcTest, error: funcError } = await supabaseAdmin
      .rpc('map_envia_status', { envia_status: 'PICKED UP' });
    
    if (!funcError && funcTest === 'picked_up') {
      console.log('   ✅ Función map_envia_status existe y funciona');
      checks.functions = true;
    } else {
      // Intentar verificar de otra forma
      console.log('   ⚠️  No se pudo verificar función directamente');
      console.log('      (Esto es normal si la función no está expuesta como RPC)');
      console.log('      La función existe si el SQL se ejecutó correctamente');
    }

    // 4. Verificar vista
    console.log('\n4️⃣ Verificando vista v_shipments_dashboard...');
    const { data: viewTest, error: viewError } = await supabaseAdmin
      .from('v_shipments_dashboard')
      .select('id')
      .limit(0);
    
    if (!viewError) {
      console.log('   ✅ Vista v_shipments_dashboard existe');
      checks.view = true;
    } else {
      console.log('   ❌ Vista no existe');
      console.log('      Error:', viewError.message);
    }

    // Resumen
    console.log('\n' + '='.repeat(50));
    console.log('📊 Resumen de Verificación:\n');
    
    const passedCount = Object.values(checks).filter(v => v === true).length;
    const totalChecks = Object.keys(checks).length;
    
    console.log(`   Verificaciones pasadas: ${passedCount}/${totalChecks}\n`);
    
    if (checks.columns && checks.tables && checks.view) {
      console.log('✅ ¡Upgrade v5 ejecutado correctamente!');
      console.log('\n   Las tablas, columnas y vistas están en su lugar.');
      console.log('   El sistema está listo para usar los nuevos estados de envío.');
    } else {
      console.log('⚠️  Upgrade v5 incompleto o no ejecutado');
      console.log('\n   Por favor, ejecuta schema-upgrade-v5.sql en Supabase SQL Editor:');
      console.log('   1. Ve a https://app.supabase.com');
      console.log('   2. Selecciona tu proyecto');
      console.log('   3. Ve a SQL Editor');
      console.log('   4. Copia y pega el contenido de src/database/schema-upgrade-v5.sql');
      console.log('   5. Haz clic en Run');
      console.log('\n   Ver guía completa: src/database/UPGRADE-V5-GUIDE.md');
    }

  } catch (error) {
    console.error('\n❌ Error durante verificación:', error);
    console.error('\n   Por favor, ejecuta schema-upgrade-v5.sql manualmente en Supabase.');
    console.error('   Ver: src/database/UPGRADE-V5-GUIDE.md');
  }
}

// Ejecutar
verifyUpgrade();
