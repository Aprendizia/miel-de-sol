/**
 * Script para subir imágenes a Supabase Storage
 * 
 * Uso: node scripts/upload-images.js
 * 
 * Requiere: SUPABASE_URL y SUPABASE_SERVICE_KEY en .env
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const BUCKET_NAME = 'images';
const SOURCE_DIR = path.join(__dirname, '../modhu/assets/img');

// Cliente Supabase con service role key (para bypass RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Extensiones de imagen válidas
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

async function createBucketIfNotExists() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === BUCKET_NAME);
  
  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 10485760 // 10MB
    });
    if (error) throw error;
    console.log(`✅ Bucket '${BUCKET_NAME}' creado`);
  } else {
    console.log(`ℹ️  Bucket '${BUCKET_NAME}' ya existe`);
  }
}

function getAllImages(dir, baseDir = dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getAllImages(fullPath, baseDir));
    } else {
      const ext = path.extname(item).toLowerCase();
      if (IMAGE_EXTENSIONS.includes(ext)) {
        const relativePath = path.relative(baseDir, fullPath);
        files.push({ fullPath, relativePath });
      }
    }
  }
  
  return files;
}

async function uploadImage(file) {
  const fileBuffer = fs.readFileSync(file.fullPath);
  const contentType = getContentType(file.relativePath);
  
  // Usar la ruta relativa como path en el bucket
  const storagePath = file.relativePath.replace(/\\/g, '/');
  
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: true // Sobrescribir si existe
    });
  
  if (error) {
    console.error(`❌ Error subiendo ${storagePath}:`, error.message);
    return null;
  }
  
  // Obtener URL pública
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath);
  
  return urlData.publicUrl;
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml'
  };
  return types[ext] || 'application/octet-stream';
}

async function main() {
  console.log('🍯 Subiendo imágenes a Supabase Storage...\n');
  
  // Verificar variables de entorno
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
    process.exit(1);
  }
  
  // Verificar que existe el directorio fuente
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`❌ No existe el directorio: ${SOURCE_DIR}`);
    process.exit(1);
  }
  
  // Crear bucket si no existe
  await createBucketIfNotExists();
  
  // Obtener todas las imágenes
  const images = getAllImages(SOURCE_DIR);
  console.log(`📁 Encontradas ${images.length} imágenes\n`);
  
  // Subir imágenes
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    process.stdout.write(`[${i + 1}/${images.length}] ${image.relativePath}... `);
    
    const url = await uploadImage(image);
    if (url) {
      console.log('✅');
      success++;
    } else {
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Subidas: ${success}`);
  console.log(`❌ Fallidas: ${failed}`);
  console.log(`\n📍 URL base: ${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/`);
  console.log(`\nEjemplo de URL:`);
  console.log(`${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/products/product-1.png`);
}

main().catch(console.error);
