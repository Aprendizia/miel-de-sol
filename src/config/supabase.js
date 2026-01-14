import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check if we're in production
const isProduction = process.env.NODE_ENV === 'production';

// Check if Supabase is configured (not using placeholder values)
const isSupabaseConfigured = supabaseUrl && 
  supabaseUrl !== 'https://tu-proyecto.supabase.co' && 
  supabaseAnonKey && 
  supabaseAnonKey !== 'tu-anon-key' &&
  supabaseAnonKey !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

// ============================================
// PRODUCTION CHECK - NEVER allow demo mode in production
// ============================================
if (isProduction && !isSupabaseConfigured) {
  console.error('');
  console.error('══════════════════════════════════════════════════════════════');
  console.error('   ❌ ERROR CRÍTICO: Supabase NO está configurado en PRODUCCIÓN');
  console.error('══════════════════════════════════════════════════════════════');
  console.error('');
  console.error('   Las siguientes variables de entorno son requeridas:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_ANON_KEY');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY (recomendado)');
  console.error('');
  console.error('   👉 Configura estas variables en Vercel Dashboard:');
  console.error('      Settings → Environment Variables');
  console.error('══════════════════════════════════════════════════════════════');
  console.error('');
  
  // In production, we should fail fast if Supabase is not configured
  throw new Error('Supabase not configured in production. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
}

let supabase = null;
let supabaseAdmin = null;

if (isSupabaseConfigured) {
  // Client for public operations (respects RLS policies)
  supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  // Admin client for server-side operations (bypasses RLS)
  if (supabaseServiceKey && supabaseServiceKey !== 'tu-service-role-key' && supabaseServiceKey !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...') {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    console.log('✅ Supabase configurado correctamente (con service role key)');
  } else {
    // Fallback to regular client if no service key
    supabaseAdmin = supabase;
    console.log('⚠️  Supabase configurado (sin service role key - algunas funciones admin pueden fallar)');
  }
} else {
  // This should only happen in development
  console.log('⚠️  Supabase no configurado - Modo DEMO activo (solo desarrollo)');
}

// Demo/Mock mode flag - ALWAYS false in production
export const isDemoMode = !isSupabaseConfigured;

// Test connection
export async function testConnection() {
  if (!isSupabaseConfigured) {
    console.log('📦 Modo DEMO activo - Base de datos simulada');
    return true;
  }
  
  try {
    const { data, error } = await supabase.from('products').select('count').limit(1);
    if (error && error.code !== 'PGRST116') {
      console.error('❌ Supabase connection error:', error.message);
      return false;
    }
    console.log('✅ Supabase connected successfully');
    return true;
  } catch (err) {
    console.error('❌ Supabase connection failed:', err.message);
    return false;
  }
}

export { supabase, supabaseAdmin };
export default supabase;
