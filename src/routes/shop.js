import express from 'express';
import { supabase, isDemoMode } from '../config/supabase.js';
import { demoDb, products as demoProducts } from '../data/demo-data.js';
import { validateSearch } from '../middleware/security.js';

const router = express.Router();

// Shop page - Product listing with search
router.get('/', validateSearch, async (req, res) => {
  try {
    const { category, sort, search, page = 1, limit = 12 } = req.query;
    const offset = (page - 1) * limit;

    let products, categories, count;

    if (isDemoMode) {
      // Use demo data
      let filteredProducts = [...demoProducts];
      
      // Apply search filter
      if (search && search.length >= 2) {
        const searchLower = search.toLowerCase();
        filteredProducts = filteredProducts.filter(p => 
          p.name.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower) ||
          p.short_description?.toLowerCase().includes(searchLower)
        );
      }
      
      // Apply category filter
      if (category) {
        const cat = demoDb.getCategoryBySlug(category);
        if (cat) {
          filteredProducts = filteredProducts.filter(p => p.category_id === cat.id);
        }
      }
      
      // Apply sorting
      if (sort === 'price-low') {
        filteredProducts.sort((a, b) => (a.sale_price || a.price) - (b.sale_price || b.price));
      } else if (sort === 'price-high') {
        filteredProducts.sort((a, b) => (b.sale_price || b.price) - (a.sale_price || a.price));
      } else if (sort === 'name') {
        filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
      }
      
      count = filteredProducts.length;
      products = filteredProducts.slice(offset, offset + parseInt(limit));
      categories = demoDb.getCategories();
    } else {
      // Use Supabase
      let query = supabase
        .from('products')
        .select('*, categories(name, slug)', { count: 'exact' })
        .eq('is_active', true);

      // Apply search filter
      if (search && search.length >= 2) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,short_description.ilike.%${search}%`);
      }

      if (category) {
        const { data: cat } = await supabase
          .from('categories')
          .select('id')
          .eq('slug', category)
          .single();
        
        if (cat) {
          query = query.eq('category_id', cat.id);
        }
      }

      // Sorting
      switch (sort) {
        case 'price-low':
          query = query.order('price', { ascending: true });
          break;
        case 'price-high':
          query = query.order('price', { ascending: false });
          break;
        case 'name':
          query = query.order('name', { ascending: true });
          break;
        default:
          query = query.order('created_at', { ascending: false });
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error, count: totalCount } = await query;
      if (error) throw error;

      products = data || [];
      count = totalCount;

      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      categories = cats || [];
    }

    const totalPages = Math.ceil(count / limit);

    res.render('pages/shop', {
      title: search ? `Resultados: "${search}"` : 'Tienda',
      products,
      categories,
      currentCategory: category || null,
      currentSort: sort || 'newest',
      currentSearch: search || '',
      pagination: {
        page: parseInt(page),
        totalPages,
        total: count,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error loading shop:', error);
    res.render('pages/shop', {
      title: 'Tienda',
      products: [],
      categories: [],
      currentCategory: null,
      currentSort: 'newest',
      currentSearch: '',
      pagination: { page: 1, totalPages: 1, total: 0 }
    });
  }
});

// Product detail page
router.get('/product/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    let product, reviews, relatedProducts;

    if (isDemoMode) {
      // Use demo data
      product = demoDb.getProductBySlug(slug);
      reviews = [];
      
      if (product) {
        const allProducts = demoDb.getProducts().data;
        relatedProducts = allProducts
          .filter(p => p.category_id === product.category_id && p.id !== product.id)
          .slice(0, 4);
      }
    } else {
      // Use Supabase
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name, slug)')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return res.status(404).render('errors/404', {
          title: 'Producto no encontrado'
        });
      }

      product = data;

      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('*, profiles(full_name)')
        .eq('product_id', product.id)
        .eq('is_approved', true)
        .order('created_at', { ascending: false });

      reviews = reviewsData || [];

      const { data: related } = await supabase
        .from('products')
        .select('*')
        .eq('category_id', product.category_id)
        .eq('is_active', true)
        .neq('id', product.id)
        .limit(4);

      relatedProducts = related || [];
    }

    if (!product) {
      return res.status(404).render('errors/404', {
        title: 'Producto no encontrado'
      });
    }

    // Calculate average rating
    const avgRating = reviews?.length 
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
      : 0;

    res.render('pages/product-detail', {
      title: product.name,
      product,
      reviews: reviews || [],
      avgRating,
      relatedProducts: relatedProducts || []
    });
  } catch (error) {
    console.error('Error loading product:', error);
    res.status(500).render('errors/500', {
      title: 'Error',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// Category page
router.get('/category/:slug', async (req, res) => {
  res.redirect(`/shop?category=${req.params.slug}`);
});

export default router;
