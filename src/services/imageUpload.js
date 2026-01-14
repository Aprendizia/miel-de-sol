/**
 * Image Upload Service - Supabase Storage
 * 
 * Handles all image uploads to Supabase Storage bucket.
 * Works in Vercel serverless environment.
 */

import { supabaseAdmin, isDemoMode } from '../config/supabase.js';

// Configuration
const BUCKET_NAME = 'images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Get the Supabase Storage base URL
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const STORAGE_BASE_URL = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}`;

/**
 * Initialize bucket if it doesn't exist
 */
async function ensureBucketExists() {
  if (isDemoMode) return true;
  
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const exists = buckets?.some(b => b.name === BUCKET_NAME);
    
    if (!exists) {
      const { error } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE
      });
      if (error) {
        console.error('Error creating bucket:', error);
        return false;
      }
      console.log(`✅ Bucket '${BUCKET_NAME}' created`);
    }
    return true;
  } catch (error) {
    console.error('Error checking bucket:', error);
    return false;
  }
}

/**
 * Upload an image buffer to Supabase Storage
 * @param {Buffer} buffer - Image buffer
 * @param {string} filename - Target filename (e.g., 'products/my-product.png')
 * @param {string} mimeType - MIME type (e.g., 'image/png')
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadImage(buffer, filename, mimeType = 'image/png') {
  if (isDemoMode) {
    return { 
      success: true, 
      url: `${STORAGE_BASE_URL}/${filename}`,
      message: '(Demo) Image upload simulated'
    };
  }
  
  // Validate
  if (!buffer || buffer.length === 0) {
    return { success: false, error: 'No image data provided' };
  }
  
  if (buffer.length > MAX_FILE_SIZE) {
    return { success: false, error: `File too large. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB` };
  }
  
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return { success: false, error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` };
  }
  
  try {
    await ensureBucketExists();
    
    // Upload to Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filename, buffer, {
        contentType: mimeType,
        upsert: true // Overwrite if exists
      });
    
    if (error) {
      console.error('Upload error:', error);
      return { success: false, error: error.message };
    }
    
    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filename);
    
    console.log(`✅ Image uploaded: ${filename}`);
    
    return {
      success: true,
      url: urlData.publicUrl,
      path: data.path
    };
  } catch (error) {
    console.error('Upload exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Upload a base64 image to Supabase Storage
 * @param {string} base64Data - Base64 encoded image (without data URL prefix)
 * @param {string} filename - Target filename
 * @param {string} mimeType - MIME type
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadBase64(base64Data, filename, mimeType = 'image/png') {
  try {
    // Remove data URL prefix if present
    let cleanBase64 = base64Data;
    if (base64Data.includes(',')) {
      cleanBase64 = base64Data.split(',')[1];
    }
    
    // Convert to buffer
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    return await uploadImage(buffer, filename, mimeType);
  } catch (error) {
    console.error('Base64 upload error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Upload from a multer file object (memory storage)
 * @param {Object} file - Multer file object with buffer
 * @param {string} folder - Target folder (e.g., 'products')
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadMulterFile(file, folder = 'products') {
  if (!file || !file.buffer) {
    return { success: false, error: 'No file provided' };
  }
  
  // Generate unique filename
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1E6);
  const ext = file.originalname.split('.').pop().toLowerCase();
  const filename = `${folder}/${timestamp}-${random}.${ext}`;
  
  return await uploadImage(file.buffer, filename, file.mimetype);
}

/**
 * Delete an image from Supabase Storage
 * @param {string} urlOrPath - Full URL or storage path
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function deleteImage(urlOrPath) {
  if (isDemoMode) {
    return { success: true, message: '(Demo) Delete simulated' };
  }
  
  try {
    // Extract path from URL if needed
    let path = urlOrPath;
    if (urlOrPath.includes(STORAGE_BASE_URL)) {
      path = urlOrPath.replace(`${STORAGE_BASE_URL}/`, '');
    }
    
    const { error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .remove([path]);
    
    if (error) {
      console.error('Delete error:', error);
      return { success: false, error: error.message };
    }
    
    console.log(`✅ Image deleted: ${path}`);
    return { success: true };
  } catch (error) {
    console.error('Delete exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get public URL for a storage path
 * @param {string} path - Storage path
 * @returns {string}
 */
export function getPublicUrl(path) {
  return `${STORAGE_BASE_URL}/${path}`;
}

/**
 * Check if a URL is from our Supabase Storage
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isSupabaseUrl(url) {
  return url && url.includes(STORAGE_BASE_URL);
}

/**
 * Get a fallback/placeholder image URL
 * @param {string} type - Type of placeholder ('product', 'category', 'avatar')
 * @returns {string}
 */
export function getPlaceholderUrl(type = 'product') {
  const placeholders = {
    product: `${STORAGE_BASE_URL}/products/product-1.png`,
    category: `${STORAGE_BASE_URL}/work/work1.png`,
    avatar: `${STORAGE_BASE_URL}/testimonial/testimonial-1.jpg`,
    slider: `${STORAGE_BASE_URL}/slider/slider1.jpg`
  };
  return placeholders[type] || placeholders.product;
}

// Export configuration for use in other modules
export const config = {
  BUCKET_NAME,
  STORAGE_BASE_URL,
  MAX_FILE_SIZE,
  ALLOWED_TYPES
};

export default {
  uploadImage,
  uploadBase64,
  uploadMulterFile,
  deleteImage,
  getPublicUrl,
  isSupabaseUrl,
  getPlaceholderUrl,
  config
};
