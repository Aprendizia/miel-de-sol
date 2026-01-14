/**
 * Script para ejecutar schema-upgrade-v5.sql en Supabase
 * 
 * Uso:
 *   node src/database/run-upgrade-v5.js
 * 
 * Requiere:
 *   - SUPABASE_URL en .env
 *   - SUPABASE_SERVICE_ROLE_KEY en .env
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: Faltan variables de entorno');
  console.error('   Requiere: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Crear cliente Supabase con service role (bypass RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runUpgrade() {
  console.log('📦 Ejecutando schema-upgrade-v5.sql...\n');

  // Leer archivo SQL
  const sqlFile = path.join(__dirname, 'schema-upgrade-v5.sql');
  const sql = fs.readFileSync(sqlFile, 'utf-8');

  // Dividir en statements (separados por ;)
  // Nota: Esto es básico, para SQL más complejo usar un parser
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`   Encontrados ${statements.length} statements SQL\n`);

  let success = 0;
  let errors = 0;

  // Ejecutar cada statement
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    
    // Saltar comentarios
    if (statement.startsWith('--') || statement.length < 10) {
      continue;
    }

    try {
      // Usar rpc para ejecutar SQL directo
      // Nota: Supabase no tiene un endpoint directo para ejecutar SQL arbitrario
      // Necesitamos usar el SQL Editor o la API REST
      console.log(`   [${i + 1}/${statements.length}] Ejecutando statement...`);
      
      // Para ejecutar SQL directo, necesitamos usar la API REST de Supabase
      // que requiere autenticación especial. Por ahora, mostramos el SQL.
      console.log(`   ⚠️  No se puede ejecutar SQL directo desde Node.js`);
      console.log(`   Por favor, ejecuta este SQL en el Supabase SQL Editor:\n`);
      console.log(sql);
      console.log(`\n`);
      
      // Alternativa: usar psql si está disponible
      console.log(`\n💡 Alternativa: Ejecutar con psql:`);
      console.log(`   psql -h db.${SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')} -U postgres -d postgres -f ${sqlFile}\n`);
      
      process.exit(0);
      
    } catch (error) {
      errors++;
      console.error(`   ❌ Error en statement ${i + 1}:`, error.message);
    }
  }

  if (errors === 0) {
    console.log(`\n✅ Upgrade completado exitosamente!`);
  } else {
    console.log(`\n⚠️  Upgrade completado con ${errors} errores`);
  }
}

// Ejecutar
runUpgrade().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
