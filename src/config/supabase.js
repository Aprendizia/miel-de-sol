import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check if Supabase is configured
const isSupabaseConfigured = supabaseUrl && 
  supabaseUrl !== 'https://tu-proyecto.supabase.co' && 
  supabaseAnonKey && 
  supabaseAnonKey !== 'tu-anon-key';

let supabase = null;
let supabaseAdmin = null;

  console.error('');
  console.error('   👉 Configura estas variables en Vercel Dashboard:');
  console.error('      Settings → Environment Variables');
  console.error('══════════════════════════════════════════════════════════════');
  
  // Throw error to prevent app from starting with broken config
  throw new Error('Supabase not configured in production. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
    console.log('✅ Supabase configurado (con admin)');

if (isSupabaseConfigured) {
    console.log('✅ Supabase configurado (sin admin key)');
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // Admin client for server-side operations (bypasses RLS) - optional
  } else {
    supabaseAdmin = supabase; // Fallback to regular client
// Demo/Mock mode flag
export const isDemoMode = !isSupabaseConfigured;
} else if (!isProduction || forceDemoMode) {
  console.log('⚠️  Supabase no configurado - Usando modo DEMO con datos locales');
  if (forceDemoMode) {
    console.log('   (DEMO_MODE=true forzado via variable de entorno)');
  }
}

// Demo/Mock mode flag - only allowed in development OR if explicitly forced
export const isDemoMode = !isSupabaseConfigured && (!isProduction || forceDemoMode);

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
