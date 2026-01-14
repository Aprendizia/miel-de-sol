/**
 * SEO Service - Generate meta tags, sitemap, structured data
 */
import { supabase, isDemoMode } from '../config/supabase.js';
import { demoDb, products as demoProducts, categories as demoCategories } from '../data/demo-data.js';

const BASE_URL = process.env.APP_URL || 'https://modhu.com';

/**
 * Get SEO meta tags for a page
 */
export function getMetaTags(page, data = {}) {
  const defaults = {
    title: 'Modhu Honey - Miel Artesanal Mexicana',
    description: 'Tienda de miel artesanal 100% pura de México. Miel de bosque, azahar, cremada y más. Envío a todo el país.',
    image: `${BASE_URL}/assets/img/og-image.jpg`,
    url: BASE_URL,
    type: 'website'
  };

  switch (page) {
    case 'home':
      return {
        ...defaults,
        keywords: 'miel, miel artesanal, miel mexicana, miel pura, miel de abeja, apicultura'
      };

    case 'product':
      return {
        title: `${data.name} | Modhu Honey`,
        description: data.short_description || data.description?.substring(0, 160) || defaults.description,
        image: data.image_url ? `${BASE_URL}${data.image_url}` : defaults.image,
        url: `${BASE_URL}/shop/product/${data.slug}`,
        type: 'product',
        product: {
          price: data.sale_price || data.price,
          currency: 'MXN',
          availability: data.stock_quantity > 0 ? 'in stock' : 'out of stock'
        }
      };

    case 'category':
      return {
        title: `${data.name} | Modhu Honey`,
        description: data.description || `Explora nuestra selección de ${data.name}`,
        url: `${BASE_URL}/shop?category=${data.slug}`,
        type: 'website'
      };

    case 'shop':
      return {
        ...defaults,
        title: 'Tienda | Modhu Honey',
        description: 'Explora nuestra colección completa de mieles artesanales mexicanas.',
        url: `${BASE_URL}/shop`
      };

    case 'about':
      return {
        ...defaults,
        title: 'Nosotros | Modhu Honey',
        description: 'Conoce la historia detrás de Modhu Honey y nuestro compromiso con la apicultura sustentable.',
        url: `${BASE_URL}/about`
      };

    case 'contact':
      return {
        ...defaults,
        title: 'Contacto | Modhu Honey',
        description: 'Contáctanos para cualquier pregunta sobre nuestros productos o pedidos.',
        url: `${BASE_URL}/contact`
      };

    default:
      return defaults;
  }
}

/**
 * Generate structured data (JSON-LD) for a product
 */
export function getProductStructuredData(product) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || product.short_description,
    image: product.image_url ? `${BASE_URL}${product.image_url}` : undefined,
    sku: product.sku,
    brand: {
      '@type': 'Brand',
      name: 'Modhu Honey'
    },
    offers: {
      '@type': 'Offer',
      price: product.sale_price || product.price,
      priceCurrency: 'MXN',
      availability: product.stock_quantity > 0 
        ? 'https://schema.org/InStock' 
        : 'https://schema.org/OutOfStock',
      url: `${BASE_URL}/shop/product/${product.slug}`,
      seller: {
        '@type': 'Organization',
        name: 'Modhu Honey'
      }
    }
  };
}

/**
 * Generate structured data for the organization
 */
export function getOrganizationStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Modhu Honey',
    url: BASE_URL,
    logo: `${BASE_URL}/assets/img/logo.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+52-555-123-4567',
      contactType: 'customer service',
      availableLanguage: ['Spanish']
    },
    sameAs: [
      'https://facebook.com/modhuhoney',
      'https://instagram.com/modhuhoney'
    ]
  };
}

/**
 * Generate breadcrumb structured data
 */
export function getBreadcrumbStructuredData(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url ? `${BASE_URL}${item.url}` : undefined
    }))
  };
}

/**
 * Generate sitemap XML
 */
export async function generateSitemap() {
  const urls = [];
  
  // Static pages
  urls.push({ loc: '/', priority: '1.0', changefreq: 'daily' });
  urls.push({ loc: '/shop', priority: '0.9', changefreq: 'daily' });
  urls.push({ loc: '/about', priority: '0.7', changefreq: 'monthly' });
  urls.push({ loc: '/contact', priority: '0.6', changefreq: 'monthly' });

  // Get products
  let products = [];
  if (isDemoMode) {
    products = demoProducts;
  } else {
    const { data } = await supabase
      .from('products')
      .select('slug, updated_at')
      .eq('is_active', true);
    products = data || [];
  }

  products.forEach(product => {
    urls.push({
      loc: `/shop/product/${product.slug}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: product.updated_at
    });
  });

  // Get categories
  let categories = [];
  if (isDemoMode) {
    categories = demoCategories;
  } else {
    const { data } = await supabase
      .from('categories')
      .select('slug')
      .eq('is_active', true);
    categories = data || [];
  }

  categories.forEach(category => {
    urls.push({
      loc: `/shop?category=${category.slug}`,
      priority: '0.7',
      changefreq: 'weekly'
    });
  });

  // Generate XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${BASE_URL}${url.loc}</loc>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
    ${url.lastmod ? `<lastmod>${new Date(url.lastmod).toISOString().split('T')[0]}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`;

  return xml;
}

/**
 * Generate robots.txt content
 */
export function generateRobotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml

# Block admin and API
Disallow: /admin
Disallow: /api
Disallow: /auth
Disallow: /cart/checkout
`;
}

export default {
  getMetaTags,
  getProductStructuredData,
  getOrganizationStructuredData,
  getBreadcrumbStructuredData,
  generateSitemap,
  generateRobotsTxt
};
