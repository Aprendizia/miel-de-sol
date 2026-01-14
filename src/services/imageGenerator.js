/**
 * Image Generator Service using Gemini Nano Banana
 * Based on: https://ai.google.dev/gemini-api/docs/image-generation
 * 
 * Nano Banana = gemini-2.5-flash-image (speed & efficiency)
 * Nano Banana Pro = gemini-3-pro-image-preview (professional, up to 4K)
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const isGeminiConfigured = !!GEMINI_API_KEY;

let genAI = null;

if (isGeminiConfigured) {
  genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  console.log('✅ Gemini Nano Banana configurado para generación de imágenes');
} else {
  console.log('⚠️  Gemini AI no configurado - GEMINI_API_KEY no encontrada');
}

// Image prompts based on our guide
export const imagePrompts = {
  // Products
  'product-1': {
    filename: 'products/product-1.png',
    dimensions: '1:1',
    prompt: `Professional product photo of artisanal glass honey jar with dark amber forest honey. 
Rustic kraft paper label saying "Miel de Bosque", wooden lid. Slight honey drip on side. 
Soft gradient background (cream to warm gold). Studio lighting. Premium Mexican artisanal aesthetic.
Clean, e-commerce style photo. White/cream background.`
  },
  'product-2': {
    filename: 'products/product-2.png',
    dimensions: '1:1',
    prompt: `Elegant glass jar with light golden orange blossom honey (Miel de Azahar). 
White and gold label design. Orange blossom flowers decoratively placed nearby.
Bright, clean aesthetic. Soft cream background gradient. Studio product photography.`
  },
  'product-3': {
    filename: 'products/product-3.png',
    dimensions: '1:1',
    prompt: `Wide-mouth glass jar with creamy white/beige crystallized honey (Miel Cremada). 
Wooden spreading knife beside it. Rustic artisanal label.
Warm, inviting lighting. Soft shadow on cream background. Product photography style.`
  },
  'product-4': {
    filename: 'products/product-4.png',
    dimensions: '1:1',
    prompt: `Premium glass jar with medium amber multifloral organic honey. 
Green "Orgánico" certification badge on label. Wildflower decoration around.
Natural, eco-friendly aesthetic. Cream gradient background. Clean product photo.`
  },
  'product-5': {
    filename: 'products/product-5.png',
    dimensions: '1:1',
    prompt: `Clear glass jar filled with golden bee pollen granules. 
Modern minimalist label "Polen de Abeja". Wooden spoon with pollen beside it.
Clean, health-focused aesthetic. Light background. Product photography.`
  },
  'product-6': {
    filename: 'products/product-6.png',
    dimensions: '1:1',
    prompt: `Elegant wooden gift box containing 3 small honey jars of different colors 
(dark amber, light gold, creamy white). Decorative ribbon and dried flowers.
Premium gift presentation. Soft warm lighting. Product photography.`
  },
  
  // Slider/Hero images (16:9 for wide banners)
  'slider-1': {
    filename: 'slider/slider1.jpg',
    dimensions: '16:9',
    prompt: `Professional product photography: golden honey jar with wooden honey dipper dripping honey, 
surrounded by wildflowers and honeycomb. Warm golden hour lighting, shallow depth of field. 
Mexican countryside aesthetic. Premium artisanal feel. Wide landscape banner format.`
  },
  'slider-2': {
    filename: 'slider/slider2.jpg',
    dimensions: '16:9',
    prompt: `Aesthetic flatlay of breakfast scene with honey, fresh bread, wooden cutting board, 
ceramic cup of tea, and small honey jar. Morning sunlight streaming through window. 
Warm cozy atmosphere, rustic wooden table. Natural tones with golden accents. Wide banner.`
  },
  'slider-3': {
    filename: 'slider/slider3.jpg',
    dimensions: '16:9',
    prompt: `Beautiful Mexican countryside scene with wooden beehives in a sunlit meadow. 
Purple wildflowers in foreground, mountains in background. Golden hour lighting, 
cinematic composition. Natural, organic, sustainable beekeeping. Wide panoramic.`
  },
  
  // Categories (square icons)
  'category-1': {
    filename: 'work/work1.png',
    dimensions: '1:1',
    prompt: `Minimalist flat icon: single honey jar silhouette with honey drop.
Golden amber color on white background. Simple, recognizable, clean vector-style lines. 
Modern app icon style. No text.`
  },
  'category-2': {
    filename: 'work/work2.png',
    dimensions: '1:1',
    prompt: `Minimalist flat icon: honey jar with small flower decoration.
Golden and soft pink accents on white background. Clean vector style.
Simple, app icon aesthetic.`
  },
  'category-3': {
    filename: 'work/work3.png',
    dimensions: '1:1',
    prompt: `Minimalist flat icon: wide jar with spreading knife.
Creamy gold colors, flat design style on white background.
Simple lines, app icon aesthetic.`
  },
  'category-4': {
    filename: 'work/work4.png',
    dimensions: '1:1',
    prompt: `Minimalist flat icon: honeycomb hexagon pattern with bee silhouette.
Golden color palette, flat design on white background. Simple, recognizable.`
  },
  
  // About section (3:4 portrait)
  'about-1': {
    filename: 'about-us/img-about-us-1.jpg',
    dimensions: '3:4',
    prompt: `Portrait photo of traditional wooden beehives in a sunny Mexican apiary. 
Beekeeper's hands gently handling honeycomb frame. Golden sunlight, 
natural colors, documentary style. Authentic, artisanal feeling.`
  },
  
  // Testimonials (square for avatars)
  'testimonial-1': {
    filename: 'testimonial/testimonial-1.jpg',
    dimensions: '1:1',
    prompt: `Portrait headshot of friendly Mexican woman in her 40s. 
Natural smile, warm lighting, neutral background.
Professional but approachable. Warm skin tones. Square format for avatar.`
  },
  'testimonial-2': {
    filename: 'testimonial/testimonial-2.jpg',
    dimensions: '1:1',
    prompt: `Portrait headshot of Mexican man in his 30s with friendly expression.
Natural lighting, casual professional appearance.
Authentic, trustworthy look. Neutral background. Square avatar format.`
  },
  'testimonial-3': {
    filename: 'testimonial/testimonial-3.jpg',
    dimensions: '1:1',
    prompt: `Portrait headshot of Mexican woman in her 50s-60s.
Warm, grandmotherly smile. Natural silver/gray hair.
Soft lighting, homey feeling. Neutral background. Square format.`
  }
};

/**
 * Generate an image using Gemini Nano Banana
 * @param {string} promptKey - Key from imagePrompts object
 * @param {string} model - Model to use: 'flash' (default) or 'pro'
 * @param {boolean} saveLocal - Try to save locally (only works in dev, not Vercel)
 * @returns {Promise<{success: boolean, path?: string, base64?: string, error?: string}>}
 */
export async function generateImage(promptKey, model = 'flash', saveLocal = false) {
  if (!isGeminiConfigured) {
    return { success: false, error: 'Gemini API no configurada' };
  }
  
  const imageConfig = imagePrompts[promptKey];
  if (!imageConfig) {
    return { success: false, error: `Prompt "${promptKey}" no encontrado` };
  }
  
  try {
    console.log(`🎨 Generando imagen: ${promptKey} (${model})`);
    
    // Select model based on parameter
    const modelName = model === 'pro' 
      ? 'gemini-3-pro-image-preview'  // Nano Banana Pro - professional, up to 4K
      : 'gemini-2.5-flash-image';      // Nano Banana - fast & efficient
    
    const fullPrompt = `Generate a high-quality image for an e-commerce honey store website.
Style: Professional, warm golden tones, Mexican artisanal aesthetic.

${imageConfig.prompt}

Make it photorealistic, professional quality, suitable for commercial use.`;

    // Generate content with image output
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: fullPrompt,
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          aspectRatio: imageConfig.dimensions
        }
      }
    });
    
    // Process response
    if (response.candidates && response.candidates[0]) {
      const parts = response.candidates[0].content.parts;
      
      for (const part of parts) {
        if (part.inlineData) {
          const base64Data = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          
          // Try to save locally (works in dev, fails silently in Vercel)
          if (saveLocal) {
            try {
              const outputPath = path.join(__dirname, '../../modhu/assets/img', imageConfig.filename);
              const outputDir = path.dirname(outputPath);
              
              if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
              }
              
              const imageBuffer = Buffer.from(base64Data, 'base64');
              fs.writeFileSync(outputPath, imageBuffer);
              console.log(`✅ Imagen guardada localmente: ${outputPath}`);
            } catch (fsError) {
              console.log(`⚠️ No se pudo guardar localmente (normal en Vercel): ${fsError.message}`);
            }
          }
          
          // Return base64 for download
          console.log(`✅ Imagen generada: ${promptKey}`);
          return { 
            success: true, 
            filename: imageConfig.filename,
            base64: base64Data,
            mimeType: mimeType,
            dataUrl: `data:${mimeType};base64,${base64Data}`,
            model: modelName
          };
        }
      }
    }
    
    return { success: false, error: 'No se generó imagen en la respuesta' };
    
  } catch (error) {
    console.error(`❌ Error generando ${promptKey}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Generate all images (batch)
 * @param {string} model - Model to use: 'flash' or 'pro'
 * @returns {Promise<{generated: array, failed: array}>}
 */
export async function generateAllImages(model = 'flash') {
  const results = {
    generated: [],
    failed: []
  };
  
  for (const [key, config] of Object.entries(imagePrompts)) {
    const result = await generateImage(key, model);
    
    if (result.success) {
      results.generated.push({ key, path: result.path });
    } else {
      results.failed.push({ key, error: result.error });
    }
    
    // Delay to avoid rate limiting (2 seconds between requests)
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return results;
}

/**
 * List available prompts
 */
export function listPrompts() {
  return Object.entries(imagePrompts).map(([key, config]) => ({
    key,
    filename: config.filename,
    dimensions: config.dimensions
  }));
}

export default {
  isGeminiConfigured,
  generateImage,
  generateAllImages,
  listPrompts,
  imagePrompts
};
