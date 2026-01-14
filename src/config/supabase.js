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

if (isSupabaseConfigured) {
  // Client for public operations (respects RLS policies)
  supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  // Admin client for server-side operations (bypasses RLS) - optional
  if (supabaseServiceKey && supabaseServiceKey !== 'tu-service-role-key') {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    console.log('✅ Supabase configurado (con admin)');
  } else {
    supabaseAdmin = supabase; // Fallback to regular client
    console.log('✅ Supabase configurado (sin admin key)');
  }
} else {
  console.log('⚠️  Supabase no configurado - Usando modo DEMO con datos locales');
}

// Demo/Mock mode flag
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
