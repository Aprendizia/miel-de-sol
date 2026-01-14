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

// Image prompts for "Miel de Sol" Colección Solar aesthetic
export const imagePrompts = {
  // =====================================================
  // COLECCIÓN SOLAR - Premium Product Line
  // =====================================================
  
  'product-amanecer': {
    filename: 'products/product-amanecer.png',
    dimensions: '1:1',
    prompt: `Professional e-commerce product photography of premium artisanal honey jar.

BOTTLE DESIGN:
- Classic hexagonal glass jar, 225g size
- Matte BLACK screw-top lid (not wooden)
- Clean, modern silhouette

LABEL DESIGN:
- Cream/ivory paper label (#FFFDF8)
- Centered golden sun emblem with bee silhouette (Art Deco style)
- Product name "AMANECER" in elegant gold serif typography (Cormorant Garamond style)
- Subtitle "MIEL DE SOL" smaller below in caps
- Weight "225g" at bottom

HONEY COLOR:
- Light golden amber, translucent, sunrise tones

COMPOSITION:
- Centered product, slight 3/4 angle
- Pure ivory/cream background (#FFFDF8)
- Subtle soft shadow underneath (not harsh)
- High-key lighting, clean editorial style

MOOD: Premium, minimal, boutique Mexican honey brand. Editorial product photography style.`
  },
  
  'product-mediodia': {
    filename: 'products/product-mediodia.png',
    dimensions: '1:1',
    prompt: `Professional e-commerce product photography of premium artisanal honey jar.

BOTTLE DESIGN:
- Classic hexagonal glass jar, 225g size
- Matte BLACK screw-top lid
- Clean, modern silhouette

LABEL DESIGN:
- Cream/ivory paper label (#FFFDF8)
- Centered golden sun emblem with bee silhouette (Art Deco style)
- Product name "MEDIODÍA" in elegant gold serif typography
- Subtitle "MIEL DE SOL" smaller below
- Accent color: rich gold (#C79A2A)
- Weight "225g" at bottom

HONEY COLOR:
- Medium golden amber, rich and warm, perfect balance

COMPOSITION:
- Centered product, slight 3/4 angle
- Pure ivory background (#FFFDF8)
- Subtle soft shadow
- High-key editorial lighting

MOOD: Premium, balanced, the signature product. Clean boutique aesthetic.`
  },
  
  'product-ocaso': {
    filename: 'products/product-ocaso.png',
    dimensions: '1:1',
    prompt: `Professional e-commerce product photography of premium artisanal honey jar.

BOTTLE DESIGN:
- Classic hexagonal glass jar, 225g size
- Matte BLACK screw-top lid
- Clean, modern silhouette

LABEL DESIGN:
- Cream/ivory paper label (#FFFDF8)
- Centered golden sun emblem with bee silhouette
- Product name "OCASO" in elegant gold serif typography
- Subtitle "MIEL DE SOL" smaller below
- Deeper amber accent tones
- Weight "225g" at bottom

HONEY COLOR:
- Dark amber, deep sunset tones, robust appearance

COMPOSITION:
- Centered product, slight 3/4 angle
- Pure ivory background (#FFFDF8)
- Subtle soft shadow
- High-key editorial lighting

MOOD: Premium, intense, evening/sunset character. Sophisticated.`
  },
  
  // =====================================================
  // BUNDLES & KITS
  // =====================================================
  
  'bundle-duo': {
    filename: 'products/bundle-duo.png',
    dimensions: '1:1',
    prompt: `Professional product photography of honey gift bundle.

PRODUCTS:
- Two hexagonal glass honey jars side by side
- Left jar: "AMANECER" (light golden honey)
- Right jar: "OCASO" (dark amber honey)
- Both with black lids and cream labels with golden sun emblem

ARRANGEMENT:
- Jars slightly overlapping or touching
- Angled composition, dynamic but balanced
- Small decorative element: dried flower or honey dipper

BACKGROUND:
- Pure ivory (#FFFDF8)
- Subtle soft shadows
- Clean, minimal

MOOD: Gift-worthy, complementary pair, day and night concept.`
  },
  
  'kit-ritual': {
    filename: 'products/kit-ritual.png',
    dimensions: '1:1',
    prompt: `Professional product photography of premium honey gift box.

PACKAGING:
- Kraft paper gift box with lid
- Golden wax seal or embossed sun logo on top
- Rustic twine or ribbon accent
- Natural, eco-friendly aesthetic

CONTENTS (visible or suggested):
- Box contains honey jar and wooden honey dipper
- Premium unboxing experience

STYLING:
- Box slightly open or closed with elegant presentation
- Cinnamon stick or dried orange slice as decoration
- Linen fabric underneath

BACKGROUND:
- Warm ivory/cream (#FFFDF8)
- Soft natural lighting
- Subtle shadows

MOOD: Gift-ready, ritual experience, premium Mexican artisanal. Perfect for gifting.`
  },
  
  // =====================================================
  // HERO SLIDER IMAGES (16:9)
  // =====================================================
  
  'slider-1': {
    filename: 'slider/slider1.jpg',
    dimensions: '16:9',
    prompt: `Wide editorial banner for honey e-commerce hero section.

SCENE:
- Three honey jars (Amanecer, Mediodía, Ocaso) arranged in elegant composition
- Wooden honey dipper with honey dripping
- Soft morning light streaming from left
- Honeycomb piece as accent

PRODUCTS:
- Glass jars with black lids
- Cream labels with golden sun emblem
- Different honey colors: light gold, medium amber, dark amber

BACKGROUND:
- Gradient from warm ivory to soft golden
- Subtle honeycomb pattern at 5% opacity
- Clean, editorial magazine style

COMPOSITION:
- Wide landscape format (16:9)
- Products on right side, space for text overlay on left
- Depth of field with front jar in focus

MOOD: Premium Mexican honey brand, "Luz en tu mesa" concept. Warm, inviting, luxurious.`
  },
  
  'slider-2': {
    filename: 'slider/slider2.jpg',
    dimensions: '16:9',
    prompt: `Wide editorial lifestyle photography for honey brand.

SCENE:
- Elegant breakfast moment
- Ceramic bowl with yogurt and honey being drizzled
- Single Miel de Sol jar (Mediodía) with black lid in background
- Fresh fruit, granola accents
- Warm morning light through window

STYLING:
- Marble or light wood surface
- Linen napkin, ceramic spoon
- Minimalist, Scandinavian-Mexican fusion aesthetic

BACKGROUND:
- Soft, airy, lots of natural light
- Cream/ivory tones dominant
- Bokeh background

COMPOSITION:
- Wide landscape (16:9)
- Action shot of honey pour
- Space for text overlay

MOOD: Ritual moment, self-care, premium breakfast. Aspirational lifestyle.`
  },
  
  'slider-3': {
    filename: 'slider/slider3.jpg',
    dimensions: '16:9',
    prompt: `Wide cinematic landscape for honey brand storytelling.

SCENE:
- Golden hour Mexican countryside
- Traditional wooden beehives in wildflower meadow
- Mountains silhouette in distance
- Purple and yellow wildflowers in foreground

ATMOSPHERE:
- Golden hour warm light
- Slight haze for depth
- Documentary but polished aesthetic

COMPOSITION:
- Wide panoramic (16:9)
- Rule of thirds, beehives on right
- Sky gradient from gold to soft blue
- Space for text overlay on left

COLOR PALETTE:
- Golden yellows, amber
- Soft greens, purple flower accents
- Warm earth tones

MOOD: Origin, authenticity, sustainable Mexican beekeeping. "Miel de Sol" name makes sense here - honey from the sun.`
  },
  
  // =====================================================
  // LEGACY PRODUCTS (keeping for backwards compatibility)
  // =====================================================
  
  'product-1': {
    filename: 'products/product-1.png',
    dimensions: '1:1',
    prompt: `Professional e-commerce product photography of premium artisanal honey jar.
Classic hexagonal glass jar with matte BLACK screw-top lid. 
Cream/ivory paper label with centered golden sun emblem and bee silhouette.
Product name "MEDIODÍA" in elegant gold serif typography.
Medium golden amber honey, rich and warm.
Pure ivory background (#FFFDF8), subtle soft shadow, high-key editorial lighting.
MOOD: Premium, balanced, the signature product. Clean boutique aesthetic.`
  },
  
  'product-2': {
    filename: 'products/product-2.png',
    dimensions: '1:1',
    prompt: `Professional e-commerce product photography of premium artisanal honey jar.
Classic hexagonal glass jar with matte BLACK screw-top lid.
Cream/ivory paper label with centered golden sun emblem and bee silhouette.
Product name "AMANECER" in elegant gold serif typography.
Light golden amber honey, translucent, sunrise tones.
Pure ivory background (#FFFDF8), subtle soft shadow, high-key editorial lighting.
MOOD: Premium, minimal, boutique Mexican honey brand. Editorial style.`
  },
  
  'product-3': {
    filename: 'products/product-3.png',
    dimensions: '1:1',
    prompt: `Professional e-commerce product photography of premium artisanal honey jar.
Classic hexagonal glass jar with matte BLACK screw-top lid.
Cream/ivory paper label with centered golden sun emblem and bee silhouette.
Product name "OCASO" in elegant gold serif typography.
Dark amber honey, deep sunset tones, robust appearance.
Pure ivory background (#FFFDF8), subtle soft shadow, high-key editorial lighting.
MOOD: Premium, intense, evening/sunset character. Sophisticated.`
  },
  
  'product-4': {
    filename: 'products/product-4.png',
    dimensions: '1:1',
    prompt: `Professional product photography of honey gift bundle.
Two hexagonal glass honey jars side by side with black lids.
Left jar: "AMANECER" (light golden), Right jar: "OCASO" (dark amber).
Both with cream labels featuring golden sun emblem.
Jars slightly overlapping, angled composition with honey dipper.
Pure ivory background (#FFFDF8), subtle soft shadows.
MOOD: Gift-worthy, complementary pair, day and night concept.`
  },
  
  'product-5': {
    filename: 'products/product-5.png',
    dimensions: '1:1',
    prompt: `Professional product photography of premium honey gift box.
Kraft paper gift box with golden wax seal sun logo on top.
Rustic twine accent, natural eco-friendly aesthetic.
Box elegantly presented, suggesting honey jar and wooden dipper inside.
Cinnamon stick decoration, linen fabric underneath.
Warm ivory background (#FFFDF8), soft natural lighting.
MOOD: Gift-ready, ritual experience, premium Mexican artisanal.`
  },
  
  'product-6': {
    filename: 'products/product-6.png',
    dimensions: '1:1',
    prompt: `Professional product photography of honey gift bundle.
Two hexagonal glass honey jars (AMANECER and MEDIODÍA) with black lids.
Cream labels with golden sun emblem, elegant arrangement.
Wooden honey dipper laying across front.
Pure ivory background (#FFFDF8), subtle soft shadows.
MOOD: Gift-worthy, premium, perfect for sharing.`
  },
  
  // =====================================================
  // CATEGORY ICONS
  // =====================================================
  
  'category-1': {
    filename: 'work/work1.png',
    dimensions: '1:1',
    prompt: `Minimalist flat icon: single honey jar silhouette with honey drop.
Golden amber color (#C79A2A) on white background. Simple, recognizable, clean vector-style lines. 
Modern app icon style. No text. Art Deco influenced.`
  },
  
  'category-2': {
    filename: 'work/work2.png',
    dimensions: '1:1',
    prompt: `Minimalist flat icon: honey jar with small sun rays decoration.
Golden and soft amber accents on white background. Clean vector style.
Simple, app icon aesthetic. Art Deco sun motif.`
  },
  
  'category-3': {
    filename: 'work/work3.png',
    dimensions: '1:1',
    prompt: `Minimalist flat icon: gift box with ribbon and sun seal.
Golden colors, flat design style on white background.
Simple lines, app icon aesthetic. Premium gift concept.`
  },
  
  'category-4': {
    filename: 'work/work4.png',
    dimensions: '1:1',
    prompt: `Minimalist flat icon: honeycomb hexagon pattern with sun emblem center.
Golden color palette (#C79A2A), flat design on white background. 
Simple, recognizable. Art Deco geometric style.`
  },
  
  // =====================================================
  // ABOUT & TESTIMONIALS
  // =====================================================
  
  'about-1': {
    filename: 'about-us/img-about-us-1.jpg',
    dimensions: '3:4',
    prompt: `Portrait photo of traditional wooden beehives in a sunny Mexican apiary. 
Beekeeper's hands gently handling honeycomb frame. Golden sunlight, 
natural colors, documentary style. Authentic, artisanal feeling.
Warm amber tones, editorial quality.`
  },
  
  'testimonial-1': {
    filename: 'testimonial/testimonial-1.jpg',
    dimensions: '1:1',
    prompt: `Portrait headshot of friendly Mexican woman in her 40s. 
Natural smile, warm lighting, neutral cream background.
Professional but approachable. Warm skin tones. Square format for avatar.`
  },
  
  'testimonial-2': {
    filename: 'testimonial/testimonial-2.jpg',
    dimensions: '1:1',
    prompt: `Portrait headshot of Mexican man in his 30s with friendly expression.
Natural lighting, casual professional appearance.
Authentic, trustworthy look. Neutral cream background. Square avatar format.`
  },
  
  'testimonial-3': {
    filename: 'testimonial/testimonial-3.jpg',
    dimensions: '1:1',
    prompt: `Portrait headshot of Mexican woman in her 50s-60s.
Warm, grandmotherly smile. Natural silver/gray hair.
Soft lighting, homey feeling. Neutral cream background. Square format.`
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
