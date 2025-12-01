/**
 * Cerebras AI Experiment - Isolated Frontend Scripts
 *
 * This is a completely isolated implementation that doesn't affect
 * the main scripts.js. Uses the Cerebras worker for generation.
 */

import {
  decorateBlock,
  loadBlock,
  decorateButtons,
  decorateIcons,
  loadCSS,
} from './aem.js';

// Cerebras worker URL
const CEREBRAS_WORKER_URL = 'https://vitamix-generative-cerebras.paolo-moz.workers.dev';

// Storage key for cached generation
const CACHE_KEY = 'cerebras-generation-cache';

/**
 * Generate a URL-safe slug from a query
 */
function generateSlug(query) {
  let slug = query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);

  const hash = simpleHash(query + Date.now()).slice(0, 6);
  return `${slug}-${hash}`;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash &= hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Escape string for use in regex
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/**
 * Check if we're on the Cerebras generation page
 */
function isCerebrasGeneration() {
  const params = new URLSearchParams(window.location.search);
  return params.has('cerebras');
}

/**
 * Render a single block section
 */
async function renderBlockSection(blockData, container) {
  const section = document.createElement('div');
  section.className = 'section';
  if (blockData.sectionStyle && blockData.sectionStyle !== 'default') {
    section.classList.add(blockData.sectionStyle);
  }
  section.dataset.sectionStatus = 'initialized';
  section.innerHTML = blockData.html;

  // Store original src for each generated image
  section.querySelectorAll('img[data-gen-image]').forEach((img) => {
    img.dataset.originalSrc = img.getAttribute('src');
  });

  // Wrap block in a wrapper div (EDS pattern)
  const blockEl = section.querySelector('[class]');
  if (blockEl) {
    const blockName = blockEl.classList[0];
    const wrapper = document.createElement('div');
    wrapper.className = `${blockName}-wrapper`;
    blockEl.parentNode.insertBefore(wrapper, blockEl);
    wrapper.appendChild(blockEl);
    decorateBlock(blockEl);
    section.classList.add(`${blockName}-container`);
  }

  decorateButtons(section);
  decorateIcons(section);
  container.appendChild(section);

  const block = section.querySelector('.block');
  if (block) {
    await loadBlock(block);
  }

  section.dataset.sectionStatus = 'loaded';
  section.style.display = null;

  return section;
}

/**
 * Render the Cerebras generative page from cached content
 */
async function renderCachedPage() {
  const main = document.querySelector('main');
  if (!main) return false;

  const cached = sessionStorage.getItem(CACHE_KEY);
  if (!cached) return false;

  const { blocks, query, slug, startTime, expectedBlocks, imageProvider } = JSON.parse(cached);
  sessionStorage.removeItem(CACHE_KEY);

  console.log(`[Cerebras] Rendering ${blocks.length} cached blocks`);

  main.innerHTML = '<div id="generation-content"></div>';
  const content = main.querySelector('#generation-content');

  // Render all blocks
  for (const blockData of blocks) {
    await renderBlockSection(blockData, content);
  }

  // Update title
  const h1 = content.querySelector('h1');
  if (h1) {
    document.title = `${h1.textContent} | Vitamix (Cerebras)`;
  }

  // Reconnect to SSE to receive image-ready events
  const imagesParam = imageProvider ? `&images=${imageProvider}` : '';
  const streamUrl = `${CEREBRAS_WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}${imagesParam}`;
  const eventSource = new EventSource(streamUrl);

  eventSource.addEventListener('image-ready', (e) => {
    const data = JSON.parse(e.data);
    const { imageId, url } = data;

    let resolvedUrl = url;
    if (url && url.startsWith('/')) {
      resolvedUrl = `${CEREBRAS_WORKER_URL}${url}`;
    }

    const img = content.querySelector(`img[data-gen-image="${imageId}"]`);
    if (img && resolvedUrl) {
      img.src = resolvedUrl;
      img.classList.add('loaded');
      console.log(`[Cerebras] Image loaded: ${imageId}`);
    }
  });

  eventSource.addEventListener('generation-complete', () => {
    eventSource.close();
    console.log('[Cerebras] All images loaded');
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      console.log('[Cerebras] Image stream closed');
    }
  };

  return true;
}

/**
 * Render the Cerebras generative page (fallback if no cache)
 */
async function renderCerebrasPage() {
  const main = document.querySelector('main');
  if (!main) return;

  const params = new URLSearchParams(window.location.search);
  const query = params.get('cerebras');
  const images = params.get('images') || 'fal'; // Default to fast

  // Check for cached content first
  if (params.has('cached')) {
    const rendered = await renderCachedPage();
    if (rendered) return;
  }

  // No cache - start generation directly (for header search or direct navigation)
  await renderWithSSE(query, images);
}

/**
 * Render page by streaming from SSE (used when no cache available)
 */
async function renderWithSSE(query, imageProvider) {
  const main = document.querySelector('main');
  const slug = generateSlug(query);
  const startTime = Date.now();

  main.innerHTML = '<div id="generation-content"></div>';
  const content = main.querySelector('#generation-content');

  // Connect to SSE stream
  const streamUrl = `${CEREBRAS_WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}&images=${imageProvider}`;
  const eventSource = new EventSource(streamUrl);

  console.log(`[Cerebras] Starting SSE stream for: ${query}`);

  eventSource.addEventListener('block-content', async (e) => {
    const data = JSON.parse(e.data);
    await renderBlockSection(data, content);
  });

  eventSource.addEventListener('image-ready', (e) => {
    const data = JSON.parse(e.data);
    const { imageId, url } = data;

    let resolvedUrl = url;
    if (url && url.startsWith('/')) {
      resolvedUrl = `${CEREBRAS_WORKER_URL}${url}`;
    }

    const img = content.querySelector(`img[data-gen-image="${imageId}"]`);
    if (img && resolvedUrl) {
      img.src = resolvedUrl;
      img.classList.add('loaded');
    }
  });

  eventSource.addEventListener('generation-complete', () => {
    eventSource.close();
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`[Cerebras] Complete in ${totalTime}s`);

    // Update title
    const h1 = content.querySelector('h1');
    if (h1) {
      document.title = `${h1.textContent} | Vitamix (Cerebras)`;
    }
  });

  eventSource.addEventListener('error', (e) => {
    if (e.data) {
      const data = JSON.parse(e.data);
      main.innerHTML = `
        <div class="section cerebras-loading">
          <h1>Something went wrong</h1>
          <p style="color: #c00;">${data.message}</p>
          <p><a href="/">Try again</a></p>
        </div>
      `;
    }
    eventSource.close();
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      console.log('[Cerebras] SSE connection closed');
    }
  };
}

/**
 * Get current image quality setting
 */
function getImageQuality() {
  const activeOption = document.querySelector('.image-quality-toggle .toggle-option.active');
  return activeOption ? activeOption.dataset.value : 'fast';
}

/**
 * Start generation from homepage using the new categorized path flow
 *
 * New flow:
 * 1. Redirect to worker's /?q= endpoint
 * 2. Worker creates DA page with cerebras-generated block
 * 3. Worker redirects to the DA page URL
 * 4. DA page's cerebras-generated block streams content from worker
 */
function startGeneration(query) {
  // Get image quality setting (fast = fal, best = imagen)
  const imageQuality = getImageQuality();
  const imageProvider = imageQuality === 'best' ? 'imagen' : 'fal';

  // Get UI elements - homepage form
  const submitBtn = document.querySelector('#cerebras-form button[type="submit"]');
  const input = document.getElementById('cerebras-query');

  // Get UI elements - header search
  const header = document.querySelector('header');
  const headerBtn = header ? header.querySelector('button') : null;
  const headerInput = header ? header.querySelector('input[type="text"], input[type="search"], input:not([type])') : null;

  // Show loading state on homepage button
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="generating-spinner"></div>
      <span>Preparing page...</span>
    `;
  }
  if (input) {
    input.disabled = true;
  }

  // Show loading state on header button
  if (headerBtn) {
    headerBtn.disabled = true;
    headerBtn.innerHTML = `
      <div class="generating-spinner"></div>
      <span>Preparing...</span>
    `;
  }
  if (headerInput) {
    headerInput.disabled = true;
  }

  // Disable suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.disabled = true;
    chip.style.pointerEvents = 'none';
    chip.style.opacity = '0.5';
  });

  console.log(`[Cerebras] Starting generation with categorized path flow`);
  console.log(`[Cerebras] Query: "${query}", Images: ${imageProvider}`);

  // Redirect to worker which will:
  // 1. Classify intent
  // 2. Create DA page with placeholder block
  // 3. Redirect to DA page URL
  const workerUrl = `${CEREBRAS_WORKER_URL}/?q=${encodeURIComponent(query)}&images=${imageProvider}`;
  window.location.href = workerUrl;
}

/**
 * Setup the query form on cerebras.html
 */
function setupCerebrasForm() {
  const form = document.getElementById('cerebras-form');
  if (!form) return;

  const input = document.getElementById('cerebras-query');

  // Handle form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) {
      input.focus();
      return;
    }

    startGeneration(query);
  });

  // Handle example buttons (legacy) and suggestion chips (new homepage)
  const exampleBtns = form.querySelectorAll('.example-btn');
  exampleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value = btn.textContent;
      input.focus();
    });
  });

  // Handle suggestion chips (new homepage design)
  const suggestionChips = document.querySelectorAll('.suggestion-chip');
  suggestionChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const query = chip.dataset.query || chip.textContent;
      startGeneration(query);
    });
  });

  // Handle image quality toggle
  const toggleOptions = document.querySelectorAll('.image-quality-toggle .toggle-option');
  toggleOptions.forEach((option) => {
    option.addEventListener('click', () => {
      toggleOptions.forEach((opt) => opt.classList.remove('active'));
      option.classList.add('active');
    });
  });
}

/**
 * Setup header search form using event capturing to intercept before other handlers
 */
function setupHeaderSearch() {
  // Use capturing phase to intercept before any other handlers
  document.addEventListener('submit', (e) => {
    const form = e.target;
    const header = form.closest('header');
    if (!header) return; // Not a header form

    const input = form.querySelector('input[type="text"], input[type="search"], input:not([type])');
    if (!input) return;

    const query = input.value.trim();
    if (query) {
      e.preventDefault();
      e.stopImmediatePropagation();
      startGeneration(query);
    }
  }, true); // true = capturing phase

  // Also intercept clicks on header buttons
  document.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button) return;

    const header = button.closest('header');
    if (!header) return;

    const input = header.querySelector('input[type="text"], input[type="search"], input:not([type])');
    if (!input) return;

    const query = input.value.trim();
    if (query) {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Show spinner on button (preserve width)
      const btnWidth = button.offsetWidth;
      button.disabled = true;
      input.disabled = true;
      button.style.minWidth = `${btnWidth}px`;
      button.innerHTML = '<div class="header-search-spinner"></div>';

      startGeneration(query);
    }
  }, true); // true = capturing phase

  // Also intercept Enter key in header inputs
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;

    const input = e.target;
    if (!input.matches('input[type="text"], input[type="search"], input:not([type])')) return;

    const header = input.closest('header');
    if (!header) return;

    const query = input.value.trim();
    if (query) {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Show spinner on button (preserve width)
      const button = header.querySelector('button');
      if (button) {
        const btnWidth = button.offsetWidth;
        button.disabled = true;
        button.style.minWidth = `${btnWidth}px`;
        button.innerHTML = '<div class="header-search-spinner"></div>';
      }
      input.disabled = true;

      startGeneration(query);
    }
  }, true); // true = capturing phase

  console.log('[Cerebras] Header search event listeners attached');
}

/**
 * Initialize
 */
async function init() {
  // Show the body (hidden by default in styles.css)
  document.body.classList.add('appear');

  // Always setup header search (works on all pages)
  setupHeaderSearch();

  // Check if this is a generation request
  if (isCerebrasGeneration()) {
    await loadCSS('/styles/cerebras.css');
    await renderCerebrasPage();
  } else {
    // Setup the form on the homepage
    setupCerebrasForm();
  }
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
