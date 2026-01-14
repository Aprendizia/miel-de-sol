// Demo data for development mode (when Supabase is not configured)
// El Rincón de la Miel - Product catalog based on real honey products

export const categories = [
  { id: '0', name: 'Colección Solar', slug: 'coleccion-solar', description: 'Tres momentos del día, tres sabores únicos. Edición limitada por temporada.', is_active: true, sort_order: 0, image_url: '/assets/img/products/product-1.png' },
  { id: '1', name: 'Miel Multiflora', slug: 'miel-multiflora', description: 'Miel de diversas flores silvestres - La más completa por su diversidad floral', is_active: true, sort_order: 1, image_url: '/assets/img/work/work1.png' },
  { id: '2', name: 'Miel Monofloral', slug: 'miel-monofloral', description: 'Miel de una sola especie floral - Beneficios específicos y sabores únicos', is_active: true, sort_order: 2, image_url: '/assets/img/work/work2.png' },
  { id: '3', name: 'Propóleo', slug: 'propoleo', description: 'La medicina natural de la colmena - Antibacteriano y antiviral', is_active: true, sort_order: 3, image_url: '/assets/img/work/work3.png' },
  { id: '4', name: 'Polen', slug: 'polen', description: 'Superalimento de las abejas - Rico en proteínas y vitaminas', is_active: true, sort_order: 4, image_url: '/assets/img/work/work4.png' },
  { id: '5', name: 'Jalea Real', slug: 'jalea-real', description: 'El alimento exclusivo de la reina - Regeneración y vitalidad', is_active: true, sort_order: 5, image_url: '/assets/img/work/work5.png' },
  { id: '6', name: 'Sets y Regalos', slug: 'sets-regalos', description: 'Combinaciones perfectas para regalar', is_active: true, sort_order: 6, image_url: '/assets/img/work/work6.png' }
];

export const products = [
  // ============================================
  // COLECCIÓN SOLAR - Edición Limitada
  // Tres momentos del día, tres sabores únicos
  // ============================================
  {
    id: 'solar-1',
    name: 'Amanecer',
    slug: 'miel-amanecer',
    short_description: 'Floral y suave - Para empezar el día con luz',
    description: `Miel clara de floración primaveral. Notas florales suaves con un toque cítrico que despierta los sentidos.

**Perfil de sabor:**
• Intensidad: Suave
• Notas: Florales, cítricas, frescas
• Color: Dorado claro, casi transparente

**Ideal para:**
☕ El té de la mañana
🥣 Yogurt y granola
🍞 Tostadas y pan artesanal

**Cosecha:** Primavera 2024
**Origen:** Veracruz, México
**Lote:** AM-2024-001`,
    price: 289.00,
    sale_price: null,
    image_url: '/assets/img/products/product-2.png',
    images: [
      { url: '/assets/img/products/product-2.png' }
    ],
    category_id: '0',
    categories: { name: 'Colección Solar', slug: 'coleccion-solar' },
    stock_quantity: 25,
    weight: '350g',
    is_active: true,
    is_featured: true,
    created_at: '2024-04-01'
  },
  {
    id: 'solar-2',
    name: 'Mediodía',
    slug: 'miel-mediodia',
    short_description: 'Perfecta y equilibrada - El punto exacto del día',
    description: `Nuestra miel más versátil. Equilibrio perfecto entre dulzura e intensidad, como el sol en su punto más alto.

**Perfil de sabor:**
• Intensidad: Media
• Notas: Caramelo dorado, mantequilla, vainilla
• Color: Ámbar dorado brillante

**Ideal para:**
🍳 Cocinar y hornear
🧀 Quesos y charcutería
🥗 Aderezos y vinagretas

**Cosecha:** Verano 2024
**Origen:** Oaxaca, México
**Lote:** MD-2024-001`,
    price: 319.00,
    sale_price: null,
    image_url: '/assets/img/products/product-1.png',
    images: [
      { url: '/assets/img/products/product-1.png' }
    ],
    category_id: '0',
    categories: { name: 'Colección Solar', slug: 'coleccion-solar' },
    stock_quantity: 30,
    weight: '350g',
    is_active: true,
    is_featured: true,
    created_at: '2024-04-01'
  },
  {
    id: 'solar-3',
    name: 'Ocaso',
    slug: 'miel-ocaso',
    short_description: 'Ámbar y robusta - Para cerrar el día con calidez',
    description: `Miel oscura de floración tardía. Profunda, especiada y con carácter. Como un atardecer que no quieres que termine.

**Perfil de sabor:**
• Intensidad: Fuerte
• Notas: Madera, especias, melaza
• Color: Ámbar oscuro, cobrizo

**Ideal para:**
🧀 Quesos maduros y azules
🍖 Marinados y glaseados
🍷 Maridaje con vino tinto

**Cosecha:** Otoño 2024
**Origen:** Chiapas, México
**Lote:** OC-2024-001`,
    price: 349.00,
    sale_price: null,
    image_url: '/assets/img/products/product-3.png',
    images: [
      { url: '/assets/img/products/product-3.png' }
    ],
    category_id: '0',
    categories: { name: 'Colección Solar', slug: 'coleccion-solar' },
    stock_quantity: 20,
    weight: '350g',
    is_active: true,
    is_featured: true,
    created_at: '2024-04-01'
  },

  // ============================================
  // MIEL MULTIFLORA - La más completa
  // ============================================
  {
    id: '1',
    name: 'Miel Multiflora de Montaña',
    slug: 'miel-multiflora-montana',
    short_description: 'La miel más completa - Diversas flores silvestres de Veracruz',
    description: `Nuestra miel multiflora proviene del néctar de diversas flores silvestres de las montañas de Veracruz. Es la miel más completa por su diversidad floral.

**Características:**
• Sabor equilibrado y aromático
• Color variable según la temporada
• Alta riqueza nutricional

**Ideal para:**
• Endulzante natural diario
• Fortalecer el sistema inmune
• Niños y adultos mayores
• Tés, café y recetas

💡 Si cristaliza, ¡ES BUENA SEÑAL! La cristalización es natural y prueba de pureza.`,
    price: 280.00,
    sale_price: null,
    image_url: '/assets/img/products/product-1.png',
    images: [
      { url: '/assets/img/products/product-1.png' },
      { url: '/assets/img/shop-view/img-shop-view.jpg' }
    ],
    category_id: '1',
    categories: { name: 'Miel Multiflora', slug: 'miel-multiflora' },
    stock_quantity: 50,
    weight: '500g',
    is_active: true,
    is_featured: true,
    created_at: '2024-01-15'
  },
  {
    id: '2',
    name: 'Miel Multiflora Familiar',
    slug: 'miel-multiflora-familiar',
    short_description: 'Presentación familiar - Ideal para el consumo diario',
    description: `Presentación especial para toda la familia. La misma miel multiflora premium en un tamaño ideal para hogares que disfrutan de miel todos los días.

**Beneficios de la miel 100% natural:**
• Enzimas vivas que ayudan a la digestión
• Antioxidantes naturales
• Minerales esenciales
• Propiedades antibacterianas

**Modo de uso:**
1-2 cucharadas al día, sola o con alimentos. Perfecta en el desayuno, con frutas, yogurt o para cocinar.`,
    price: 450.00,
    sale_price: 399.00,
    image_url: '/assets/img/products/product-4.png',
    images: [
      { url: '/assets/img/products/product-4.png' }
    ],
    category_id: '1',
    categories: { name: 'Miel Multiflora', slug: 'miel-multiflora' },
    stock_quantity: 35,
    weight: '1kg',
    is_active: true,
    is_featured: true,
    created_at: '2024-02-10'
  },

  // ============================================
  // MIEL MONOFLORAL - Beneficios específicos
  // ============================================
  {
    id: '3',
    name: 'Miel de Azahar',
    slug: 'miel-azahar',
    short_description: 'Relajante natural - Ayuda a dormir mejor',
    description: `La miel de azahar proviene principalmente de las flores de naranjo. Es una de las mieles monoflorales más apreciadas por sus propiedades relajantes.

**Características:**
• Sabor delicado con notas cítricas
• Color claro y dorado
• Aroma floral distintivo

**Beneficios específicos:**
🍊 Efecto relajante natural
😴 Ayuda a conciliar el sueño
🧘 Reduce el estrés y la ansiedad

**Modo de uso:**
Una cucharada antes de dormir, sola o con té de manzanilla. Perfecta para niños inquietos a la hora de dormir.`,
    price: 320.00,
    sale_price: 289.00,
    image_url: '/assets/img/products/product-2.png',
    images: [
      { url: '/assets/img/products/product-2.png' }
    ],
    category_id: '2',
    categories: { name: 'Miel Monofloral', slug: 'miel-monofloral' },
    stock_quantity: 30,
    weight: '350g',
    is_active: true,
    is_featured: true,
    created_at: '2024-01-20'
  },
  {
    id: '4',
    name: 'Miel de Mezquite',
    slug: 'miel-mezquite',
    short_description: 'Suave y digestiva - Ideal para estómagos sensibles',
    description: `La miel de mezquite proviene de los característicos árboles del norte de México. Es conocida por su sabor suave y propiedades digestivas.

**Características:**
• Sabor suave con toques acaramelados
• Color ámbar claro
• Textura sedosa

**Beneficios específicos:**
🌵 Suave para el estómago
💫 Ayuda a la digestión
🍵 Ideal para bebidas calientes

**Recomendada para:**
Personas con estómagos sensibles, adultos mayores y quienes buscan una miel de sabor delicado.`,
    price: 340.00,
    sale_price: null,
    image_url: '/assets/img/products/product-3.png',
    images: [
      { url: '/assets/img/products/product-3.png' }
    ],
    category_id: '2',
    categories: { name: 'Miel Monofloral', slug: 'miel-monofloral' },
    stock_quantity: 25,
    weight: '400g',
    is_active: true,
    is_featured: false,
    created_at: '2024-02-01'
  },
  {
    id: '5',
    name: 'Miel de Tajonal',
    slug: 'miel-tajonal',
    short_description: 'Muy aromática y energética - La favorita de Yucatán',
    description: `El tajonal es una planta endémica de la península de Yucatán. Su miel es altamente valorada por su aroma intenso y propiedades energéticas.

**Características:**
• Sabor intenso y aromático
• Color ámbar oscuro
• Aroma distintivo e inolvidable

**Beneficios específicos:**
⚡ Altamente energética
💪 Ideal para deportistas
🧠 Mejora la concentración

**Dato curioso:**
Los mayas la consideraban sagrada y la usaban en ceremonias. Es una de las mieles más valoradas de México.`,
    price: 380.00,
    sale_price: null,
    image_url: '/assets/img/letest-product/letest-produts-1.png',
    images: [
      { url: '/assets/img/letest-product/letest-produts-1.png' }
    ],
    category_id: '2',
    categories: { name: 'Miel Monofloral', slug: 'miel-monofloral' },
    stock_quantity: 20,
    weight: '350g',
    is_active: true,
    is_featured: true,
    created_at: '2024-03-01'
  },

  // ============================================
  // PROPÓLEO - La medicina de la colmena
  // ============================================
  {
    id: '6',
    name: 'Propóleo en Spray',
    slug: 'propoleo-spray',
    short_description: 'Antibacteriano natural - Ideal para garganta irritada',
    description: `El propóleo es la "medicina natural" de la colmena. Las abejas lo usan para desinfectar y proteger su hogar. Nuestro spray es puro y concentrado.

**¿Qué es el propóleo?**
Es una sustancia resinosa que las abejas elaboran a partir de resinas de árboles y flores. Tiene poderosas propiedades antimicrobianas.

**Beneficios:**
🦠 Antibacteriano y antiviral natural
🛡️ Refuerza las defensas
🗣️ Alivia garganta irritada
💊 Ayuda con aftas y llagas bucales

**Modo de uso:**
2 a 4 atomizaciones al día, directo en garganta. Ideal en temporadas de frío.

⚠️ No administrar a niños menores de 2 años.`,
    price: 195.00,
    sale_price: null,
    image_url: '/assets/img/letest-product/letest-produts-2.png',
    images: [
      { url: '/assets/img/letest-product/letest-produts-2.png' }
    ],
    category_id: '3',
    categories: { name: 'Propóleo', slug: 'propoleo' },
    stock_quantity: 40,
    weight: '30ml',
    is_active: true,
    is_featured: true,
    created_at: '2024-03-05'
  },
  {
    id: '7',
    name: 'Propóleo Tintura',
    slug: 'propoleo-tintura',
    short_description: 'Extracto concentrado - Múltiples usos',
    description: `Tintura de propóleo altamente concentrada para diversos usos. Puede diluirse en agua, miel o aplicarse tópicamente.

**Beneficios:**
• Sistema inmunológico más fuerte
• Propiedades antiinflamatorias
• Acelera cicatrización
• Combate hongos y bacterias

**Modos de uso:**
💧 Oral: 10-15 gotas en agua o miel, 2-3 veces al día
🩹 Tópico: Aplicar directamente en heridas pequeñas

**Muy buscado en:**
• Temporadas de frío
• Para deportistas
• Tratamiento de afecciones bucales`,
    price: 250.00,
    sale_price: 220.00,
    image_url: '/assets/img/products/product-5.png',
    images: [
      { url: '/assets/img/products/product-5.png' }
    ],
    category_id: '3',
    categories: { name: 'Propóleo', slug: 'propoleo' },
    stock_quantity: 25,
    weight: '50ml',
    is_active: true,
    is_featured: false,
    created_at: '2024-03-10'
  },

  // ============================================
  // POLEN - El superalimento
  // ============================================
  {
    id: '8',
    name: 'Polen de Abeja Premium',
    slug: 'polen-abeja',
    short_description: 'Superalimento natural - Alto en proteínas',
    description: `El polen es el alimento principal de las abejas jóvenes. Es uno de los superalimentos más completos de la naturaleza.

**¿Qué contiene?**
• Hasta 40% de proteína vegetal
• Vitaminas del complejo B
• Aminoácidos esenciales
• Enzimas y antioxidantes

**Beneficios:**
💪 Alto en proteínas de fácil absorción
⚡ Aumenta energía y resistencia
🧠 Mejora concentración y memoria
🍽️ Apoya el sistema digestivo

**Modo de uso:**
1 cucharadita diaria (5-10g), en ayunas o con el desayuno. Se puede mezclar con miel, yogurt, smoothies o licuados.

**Ideal para:**
Deportistas, estudiantes, personas con cansancio crónico, adultos mayores.`,
    price: 180.00,
    sale_price: null,
    image_url: '/assets/img/letest-product/letest-produts-3.png',
    images: [
      { url: '/assets/img/letest-product/letest-produts-3.png' }
    ],
    category_id: '4',
    categories: { name: 'Polen', slug: 'polen' },
    stock_quantity: 35,
    weight: '250g',
    is_active: true,
    is_featured: true,
    created_at: '2024-02-15'
  },
  {
    id: '9',
    name: 'Polen Granulado Familiar',
    slug: 'polen-familiar',
    short_description: 'Presentación familiar - Para toda la familia',
    description: `Mismo polen premium en presentación ideal para toda la familia. Suficiente para un mes de consumo familiar.

**Beneficios comprobados:**
✅ Fortalece el sistema inmune
✅ Mejora la digestión
✅ Aumenta la vitalidad
✅ Ayuda con alergias estacionales (uso gradual)

**Consejo:**
Si nunca has consumido polen, inicia con pequeñas cantidades para verificar tolerancia. Algunas personas con alergias al polen de plantas pueden ser sensibles.

**Conservación:**
Mantener en lugar fresco y seco. Una vez abierto, refrigerar.`,
    price: 320.00,
    sale_price: 290.00,
    image_url: '/assets/img/letest-product/letest-produts-4.png',
    images: [
      { url: '/assets/img/letest-product/letest-produts-4.png' }
    ],
    category_id: '4',
    categories: { name: 'Polen', slug: 'polen' },
    stock_quantity: 20,
    weight: '500g',
    is_active: true,
    is_featured: false,
    created_at: '2024-03-15'
  },

  // ============================================
  // JALEA REAL - El alimento de la reina
  // ============================================
  {
    id: '10',
    name: 'Jalea Real Pura',
    slug: 'jalea-real-pura',
    short_description: 'Alimento exclusivo de la reina - Regeneración celular',
    description: `La jalea real es el alimento más exclusivo de la colmena. Solo la abeja reina la consume durante toda su vida, lo que le permite vivir hasta 5 años (vs 6 semanas de una obrera).

**¿Por qué es especial?**
La reina es la única abeja que se alimenta de jalea real toda su vida. Esto le da:
• Mayor tamaño
• Capacidad reproductiva
• Vida 40 veces más larga

**Beneficios:**
✨ Regeneración celular
⚡ Aumenta vitalidad y energía
🧬 Propiedades antienvejecimiento
💎 El producto más premium de la colmena

**Modo de uso:**
Consumir pequeñas cantidades (0.5-1g), preferentemente en ayunas. Se puede mezclar con miel para facilitar su consumo.

**Conservación:**
⚠️ MANTENER REFRIGERADA. Producto altamente sensible al calor.`,
    price: 650.00,
    sale_price: null,
    image_url: '/assets/img/gallery/our-gallery-1.jpg',
    images: [
      { url: '/assets/img/gallery/our-gallery-1.jpg' }
    ],
    category_id: '5',
    categories: { name: 'Jalea Real', slug: 'jalea-real' },
    stock_quantity: 10,
    weight: '30g',
    is_active: true,
    is_featured: true,
    created_at: '2024-03-20'
  },
  {
    id: '11',
    name: 'Jalea Real con Miel',
    slug: 'jalea-real-miel',
    short_description: 'Mezcla perfecta - Más fácil de consumir',
    description: `Combinación de jalea real fresca con miel multiflora. La miel actúa como conservador natural y mejora el sabor, haciendo más fácil su consumo diario.

**Contenido:**
• 10% Jalea Real fresca
• 90% Miel multiflora premium

**Beneficios combinados:**
• Energía sostenida durante el día
• Fortalece sistema inmunológico
• Mejora la vitalidad general
• Más accesible que la jalea pura

**Modo de uso:**
1 cucharadita en ayunas. Puede tomarse sola o diluida en agua tibia (no caliente).

**Ideal para:**
Personas que quieren los beneficios de la jalea real de forma más económica y fácil de consumir.`,
    price: 420.00,
    sale_price: 380.00,
    image_url: '/assets/img/products/product-6.png',
    images: [
      { url: '/assets/img/products/product-6.png' }
    ],
    category_id: '5',
    categories: { name: 'Jalea Real', slug: 'jalea-real' },
    stock_quantity: 15,
    weight: '250g',
    is_active: true,
    is_featured: false,
    created_at: '2024-03-25'
  },

  // ============================================
  // SETS Y REGALOS
  // ============================================
  {
    id: '12',
    name: 'Set Degustación Premium',
    slug: 'set-degustacion',
    short_description: '5 variedades de miel - Descubre tu favorita',
    description: `El regalo perfecto para los amantes de la miel. Incluye 5 variedades de nuestras mejores mieles en presentación mini.

**Incluye:**
🍯 Miel Multiflora (80g)
🍊 Miel de Azahar (80g)
🌵 Miel de Mezquite (80g)
🌻 Miel de Tajonal (80g)
🍯 Miel Cremada (80g)

**Presentación:**
Caja de cartón reciclado con diseño artesanal. Incluye tarjeta con descripción de cada variedad.

**Ideal para:**
• Regalos especiales
• Descubrir nuevos sabores
• Eventos y degustaciones
• Detalle corporativo`,
    price: 520.00,
    sale_price: 450.00,
    image_url: '/assets/img/gallery/our-gallery-2.jpg',
    images: [
      { url: '/assets/img/gallery/our-gallery-2.jpg' }
    ],
    category_id: '6',
    categories: { name: 'Sets y Regalos', slug: 'sets-regalos' },
    stock_quantity: 15,
    weight: '5 x 80g',
    is_active: true,
    is_featured: true,
    created_at: '2024-04-01'
  },
  {
    id: '13',
    name: 'Kit Bienestar Completo',
    slug: 'kit-bienestar',
    short_description: 'Todo para tu salud - Miel + Propóleo + Polen',
    description: `El kit más completo para cuidar tu salud de forma natural. Incluye los tres productos esenciales de la colmena.

**Incluye:**
🍯 Miel Multiflora (350g)
🌿 Propóleo en Spray (30ml)
🌼 Polen de Abeja (150g)

**Beneficios del kit:**
• Sistema inmune fortalecido
• Energía y vitalidad
• Protección natural contra resfriados
• Nutrición completa

**Presentación:**
Caja regalo con lazo, incluye guía de uso de cada producto.

**Ahorro:**
Comprando el kit ahorras más del 15% vs productos individuales.`,
    price: 580.00,
    sale_price: 499.00,
    image_url: '/assets/img/gallery/our-gallery-3.jpg',
    images: [
      { url: '/assets/img/gallery/our-gallery-3.jpg' }
    ],
    category_id: '6',
    categories: { name: 'Sets y Regalos', slug: 'sets-regalos' },
    stock_quantity: 12,
    weight: 'Varios',
    is_active: true,
    is_featured: true,
    created_at: '2024-04-05'
  }
];

// Demo database helper functions
export const demoDb = {
  getProducts: ({ category, featured, search, limit = 12, offset = 0 } = {}) => {
    let filtered = [...products];
    
    if (category) {
      const cat = categories.find(c => c.slug === category);
      if (cat) {
        filtered = filtered.filter(p => p.category_id === cat.id);
      }
    }
    
    if (featured) {
      filtered = filtered.filter(p => p.is_featured);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        p.short_description.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower)
      );
    }
    
    const total = filtered.length;
    const data = filtered.slice(offset, offset + limit);
    
    return { data, count: total };
  },
  
  getProductBySlug: (slug) => {
    return products.find(p => p.slug === slug) || null;
  },
  
  getProductById: (id) => {
    return products.find(p => p.id === id) || null;
  },
  
  getCategories: () => {
    return categories.filter(c => c.is_active);
  },
  
  getCategoryBySlug: (slug) => {
    return categories.find(c => c.slug === slug) || null;
  }
};
