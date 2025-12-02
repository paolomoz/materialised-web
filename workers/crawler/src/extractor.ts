import type { ExtractedContent, ContentType, ProductSpecs, RecipeData, ImageInfo } from './types';

/**
 * Extract structured content from HTML
 */
export function extractContent(html: string, url: string): ExtractedContent {
  // Determine content type based on URL and content
  const contentType = classifyContent(url, html);

  // Extract basic metadata
  const title = extractTitle(html);
  const description = extractMetaDescription(html);

  // Extract headings
  const headings = extractHeadings(html);

  // Extract body text (cleaned)
  const bodyText = extractBodyText(html);

  // Extract images
  const images = extractImages(html, url);

  // Extract links
  const links = extractLinks(html, url);

  // Extract type-specific data
  let productSpecs: ProductSpecs | undefined;
  let recipeData: RecipeData | undefined;

  if (contentType === 'product') {
    productSpecs = extractProductSpecs(html);
  } else if (contentType === 'recipe') {
    recipeData = extractRecipeData(html);
  }

  return {
    url,
    title,
    description,
    contentType,
    headings,
    bodyText,
    productSpecs,
    recipeData,
    images,
    links,
    rawHtml: html,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Classify content type based on URL and content signals
 */
function classifyContent(url: string, html: string): ContentType {
  const urlLower = url.toLowerCase();
  const htmlLower = html.toLowerCase();

  // URL-based classification
  if (urlLower.includes('/product') || urlLower.includes('/blender') || urlLower.includes('/accessories')) {
    return 'product';
  }

  if (urlLower.includes('/recipe') || urlLower.includes('/recipes')) {
    return 'recipe';
  }

  if (urlLower.includes('/support') || urlLower.includes('/help') || urlLower.includes('/faq')) {
    return 'support';
  }

  if (urlLower.includes('/about') || urlLower.includes('/story') || urlLower.includes('/heritage')) {
    return 'brand';
  }

  if (urlLower.includes('/blog') || urlLower.includes('/article') || urlLower.includes('/tips')) {
    return 'editorial';
  }

  // Content-based classification (fallback)
  if (htmlLower.includes('add to cart') || htmlLower.includes('price') || htmlLower.includes('sku')) {
    return 'product';
  }

  if (htmlLower.includes('ingredients') && htmlLower.includes('instructions')) {
    return 'recipe';
  }

  if (htmlLower.includes('troubleshoot') || htmlLower.includes('warranty') || htmlLower.includes('contact us')) {
    return 'support';
  }

  // Default to editorial for blog-like content
  return 'editorial';
}

/**
 * Extract page title
 */
function extractTitle(html: string): string {
  // Try og:title first
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitleMatch) {
    return decodeHtmlEntities(ogTitleMatch[1]);
  }

  // Fall back to <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    return decodeHtmlEntities(titleMatch[1].trim());
  }

  // Fall back to first h1
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) {
    return decodeHtmlEntities(h1Match[1].trim());
  }

  return '';
}

/**
 * Extract meta description
 */
function extractMetaDescription(html: string): string {
  // Try og:description first
  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  if (ogDescMatch) {
    return decodeHtmlEntities(ogDescMatch[1]);
  }

  // Fall back to meta description
  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (metaDescMatch) {
    return decodeHtmlEntities(metaDescMatch[1]);
  }

  return '';
}

/**
 * Extract all headings (h1-h6)
 */
function extractHeadings(html: string): string[] {
  const headings: string[] = [];
  const headingRegex = /<h([1-6])[^>]*>([^<]*(?:<[^/h][^>]*>[^<]*)*)<\/h\1>/gi;
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    const text = stripHtmlTags(match[2]).trim();
    if (text) {
      headings.push(text);
    }
  }

  return headings;
}

/**
 * Extract clean body text, removing scripts, styles, nav, footer
 */
function extractBodyText(html: string): string {
  // Remove script and style tags
  let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove nav and footer
  cleaned = cleaned.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  cleaned = cleaned.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  cleaned = cleaned.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');

  // Remove form elements
  cleaned = cleaned.replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '');

  // Extract text from main content areas if possible
  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) {
    cleaned = mainMatch[1];
  } else {
    // Try article tag
    const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      cleaned = articleMatch[1];
    }
  }

  // Strip remaining HTML tags
  const text = stripHtmlTags(cleaned);

  // Clean up whitespace
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * Check if URL is a valid content image (not tracking pixel, icon, etc.)
 */
function isValidContentImageUrl(url: string): boolean {
  const urlLower = url.toLowerCase();

  // Exclude tracking pixels and analytics
  const trackingPatterns = [
    'facebook.com/tr',
    'doubleclick',
    'googleads',
    'google-analytics',
    'analytics',
    'pixel',
    'tracking',
    '1x1',
    'beacon',
    'spacer',
    'blank.gif',
    'clear.gif',
    'noscript',
  ];

  if (trackingPatterns.some(pattern => urlLower.includes(pattern))) {
    return false;
  }

  // Exclude UI elements and icons
  const uiPatterns = [
    '/icons/',
    '/icon-',
    '/icon.',
    '/logo',
    '/ui/',
    '/assets/icons/',
    '/favicon',
    '/sprite',
    '/placeholder',
    '/loading',
    '/button',
    '/arrow',
    '/chevron',
    '/badge',
    '/ribbon',
    '/star-rating',
    'data:image', // inline data URIs (usually tiny)
  ];

  if (uiPatterns.some(pattern => urlLower.includes(pattern))) {
    return false;
  }

  // Must be an actual image file (not a tracking endpoint)
  const hasImageExtension = /\.(jpg|jpeg|png|webp|gif)(\?|$|#)/i.test(urlLower);
  const isImageCdn = urlLower.includes('scene7') ||
    urlLower.includes('cloudinary') ||
    urlLower.includes('imgix') ||
    urlLower.includes('ctfassets') ||
    urlLower.includes('/media/') ||
    urlLower.includes('/images/');

  return hasImageExtension || isImageCdn;
}

/**
 * Extract og:image meta tag (usually the best quality content image)
 */
function extractOgImage(html: string, baseUrl: string): ImageInfo | null {
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);

  if (ogImageMatch) {
    let src = ogImageMatch[1];

    // Resolve relative URLs
    try {
      src = new URL(src, baseUrl).href;
    } catch {
      // Keep original
    }

    if (isValidContentImageUrl(src)) {
      // Get og:image:alt if available
      const altMatch = html.match(/<meta[^>]*property=["']og:image:alt["'][^>]*content=["']([^"']+)["']/i);
      const alt = altMatch ? decodeHtmlEntities(altMatch[1]) : '';

      return {
        src,
        alt,
        context: 'Primary page image (og:image)',
      };
    }
  }

  return null;
}

/**
 * Extract images with context
 */
function extractImages(html: string, baseUrl: string): ImageInfo[] {
  const images: ImageInfo[] = [];
  const seenUrls = new Set<string>();

  // First, try to get og:image (usually the best content image)
  const ogImage = extractOgImage(html, baseUrl);
  if (ogImage) {
    images.push(ogImage);
    seenUrls.add(ogImage.src);
  }

  // Then extract images from img tags
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    const alt = match[2] || '';

    // Resolve relative URLs
    let absoluteSrc = src;
    try {
      absoluteSrc = new URL(src, baseUrl).href;
    } catch {
      continue; // Skip if URL is invalid
    }

    // Skip if already seen or not a valid content image
    if (seenUrls.has(absoluteSrc) || !isValidContentImageUrl(absoluteSrc)) {
      continue;
    }

    seenUrls.add(absoluteSrc);

    // Extract surrounding context (text near the image)
    const contextStart = Math.max(0, match.index - 200);
    const contextEnd = Math.min(html.length, match.index + match[0].length + 200);
    const context = stripHtmlTags(html.slice(contextStart, contextEnd)).trim();

    images.push({
      src: absoluteSrc,
      alt: decodeHtmlEntities(alt),
      context: context.slice(0, 300),
    });
  }

  return images;
}

/**
 * Extract links from the page
 */
function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];

    try {
      const absoluteUrl = new URL(href, baseUrl).href;
      links.push(absoluteUrl);
    } catch {
      // Skip invalid URLs
    }
  }

  return [...new Set(links)]; // Dedupe
}

/**
 * Extract product specifications from a product page
 */
function extractProductSpecs(html: string): ProductSpecs {
  const specs: ProductSpecs = {
    name: '',
    features: [],
    specifications: {},
  };

  // Try to find product name
  const productNameMatch = html.match(/<h1[^>]*class=["'][^"']*product[^"']*["'][^>]*>([^<]+)<\/h1>/i)
    || html.match(/<span[^>]*class=["'][^"']*product-title[^"']*["'][^>]*>([^<]+)<\/span>/i);
  if (productNameMatch) {
    specs.name = decodeHtmlEntities(productNameMatch[1].trim());
  }

  // Try to find SKU
  const skuMatch = html.match(/sku[:"'\s]+([A-Z0-9-]+)/i)
    || html.match(/data-sku=["']([^"']+)["']/i);
  if (skuMatch) {
    specs.sku = skuMatch[1];
  }

  // Try to find price
  const priceMatch = html.match(/\$[\d,]+\.?\d*/);
  if (priceMatch) {
    specs.price = priceMatch[0];
  }

  // Extract features from lists
  const featureListMatch = html.match(/<ul[^>]*class=["'][^"']*feature[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
  if (featureListMatch) {
    const liRegex = /<li[^>]*>([^<]+)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(featureListMatch[1])) !== null) {
      specs.features.push(decodeHtmlEntities(liMatch[1].trim()));
    }
  }

  // Extract specification table
  const specTableMatch = html.match(/<table[^>]*class=["'][^"']*spec[^"']*["'][^>]*>([\s\S]*?)<\/table>/i);
  if (specTableMatch) {
    const rowRegex = /<tr[^>]*>[\s\S]*?<t[hd][^>]*>([^<]+)<\/t[hd]>[\s\S]*?<t[hd][^>]*>([^<]+)<\/t[hd]>[\s\S]*?<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(specTableMatch[1])) !== null) {
      const key = decodeHtmlEntities(rowMatch[1].trim());
      const value = decodeHtmlEntities(rowMatch[2].trim());
      if (key && value) {
        specs.specifications[key] = value;
      }
    }
  }

  return specs;
}

/**
 * Extract recipe data from a recipe page
 */
function extractRecipeData(html: string): RecipeData {
  const recipe: RecipeData = {
    name: '',
    ingredients: [],
    instructions: [],
  };

  // Try to find recipe name
  const recipeNameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (recipeNameMatch) {
    recipe.name = decodeHtmlEntities(recipeNameMatch[1].trim());
  }

  // Try to find recipe category
  const categoryMatch = html.match(/category[:"'\s]+["']?([^"',<]+)/i);
  if (categoryMatch) {
    recipe.category = categoryMatch[1].trim();
  }

  // Extract ingredients
  const ingredientsMatch = html.match(/ingredients[^>]*>([\s\S]*?)(?:<\/div>|<\/section>|<h[23])/i);
  if (ingredientsMatch) {
    const liRegex = /<li[^>]*>([^<]+(?:<[^/][^>]*>[^<]*)*)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(ingredientsMatch[1])) !== null) {
      recipe.ingredients.push(stripHtmlTags(liMatch[1]).trim());
    }
  }

  // Extract instructions
  const instructionsMatch = html.match(/instructions[^>]*>([\s\S]*?)(?:<\/div>|<\/section>|<h[23])/i);
  if (instructionsMatch) {
    const stepRegex = /<(?:li|p|div)[^>]*>([^<]+(?:<[^/][^>]*>[^<]*)*)<\/(?:li|p|div)>/gi;
    let stepMatch;
    while ((stepMatch = stepRegex.exec(instructionsMatch[1])) !== null) {
      const text = stripHtmlTags(stepMatch[1]).trim();
      if (text.length > 10) { // Skip very short fragments
        recipe.instructions.push(text);
      }
    }
  }

  // Try to find prep/cook time
  const prepTimeMatch = html.match(/prep[^:]*time[^:]*:?\s*([^<\n]+)/i);
  if (prepTimeMatch) {
    recipe.prepTime = prepTimeMatch[1].trim();
  }

  const cookTimeMatch = html.match(/cook[^:]*time[^:]*:?\s*([^<\n]+)/i);
  if (cookTimeMatch) {
    recipe.cookTime = cookTimeMatch[1].trim();
  }

  // Try to find servings
  const servingsMatch = html.match(/servings?[^:]*:?\s*(\d+)/i);
  if (servingsMatch) {
    recipe.servings = servingsMatch[1];
  }

  return recipe;
}

/**
 * Strip HTML tags from a string
 */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '-',
    '&mdash;': '-',
    '&copy;': '(c)',
    '&reg;': '(R)',
    '&trade;': '(TM)',
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  // Handle numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return decoded;
}
