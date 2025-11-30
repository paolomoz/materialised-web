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

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  // Add completion badge
  const completionSection = document.createElement('div');
  completionSection.className = 'section cerebras-complete';
  completionSection.innerHTML = `
    <div class="cerebras-complete-container">
      <div class="cerebras-complete-badge">Generated in ${totalTime}s with Cerebras</div>
      <p><a href="/">Try another query</a></p>
    </div>
  `;
  content.appendChild(completionSection);

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

    // Add completion badge
    const completionSection = document.createElement('div');
    completionSection.className = 'section cerebras-complete';
    completionSection.innerHTML = `
      <div class="cerebras-complete-container">
        <div class="cerebras-complete-badge">Generated in ${totalTime}s with Cerebras</div>
        <p><a href="/">Try another query</a></p>
      </div>
    `;
    content.appendChild(completionSection);
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
 * Start generation from homepage and navigate when ready
 */
function startGeneration(query) {
  const slug = generateSlug(query);
  const startTime = Date.now();
  const generatedBlocks = [];
  let expectedBlockCount = 0;
  let hasNavigated = false;

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
  const headerBtnOriginalHTML = headerBtn ? headerBtn.innerHTML : '';

  // Show loading state on homepage button
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <div class="generating-spinner"></div>
      <span>Generating...</span>
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
      <span>Generating...</span>
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

  // Navigate when all content blocks are received
  function navigateWhenReady() {
    if (hasNavigated) return;
    if (expectedBlockCount > 0 && generatedBlocks.length >= expectedBlockCount) {
      hasNavigated = true;
      eventSource.close();

      // Cache the generated content
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        blocks: generatedBlocks,
        query,
        slug,
        startTime,
        expectedBlocks: expectedBlockCount,
        imageProvider,
      }));

      console.log(`[Cerebras] All ${expectedBlockCount} blocks received, navigating...`);

      // Navigate to the generated page
      window.location.href = `/?cerebras=${encodeURIComponent(query)}&cached=1`;
    }
  }

  // Connect to SSE stream with image provider
  const streamUrl = `${CEREBRAS_WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}&images=${imageProvider}`;
  const eventSource = new EventSource(streamUrl);

  console.log(`[Cerebras] Starting generation with ${imageProvider} images`);

  eventSource.addEventListener('layout', (e) => {
    const data = JSON.parse(e.data);
    expectedBlockCount = data.blocks.length;
    console.log(`[Cerebras] Expecting ${expectedBlockCount} blocks`);
  });

  eventSource.addEventListener('block-content', (e) => {
    const data = JSON.parse(e.data);
    generatedBlocks.push({ html: data.html, sectionStyle: data.sectionStyle });

    // Update button text with block count
    const updateText = `Creating... (${generatedBlocks.length}/${expectedBlockCount || '?'})`;
    if (submitBtn) {
      const span = submitBtn.querySelector('span');
      if (span) span.textContent = updateText;
    }
    if (headerBtn) {
      const span = headerBtn.querySelector('span');
      if (span) span.textContent = updateText;
    }

    // Check if all blocks received
    navigateWhenReady();
  });

  // Fallback: navigate on generation-complete if we missed the block count
  eventSource.addEventListener('generation-complete', () => {
    if (!hasNavigated) {
      hasNavigated = true;
      eventSource.close();

      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        blocks: generatedBlocks,
        query,
        slug,
        startTime,
        expectedBlocks: generatedBlocks.length,
        imageProvider,
      }));

      window.location.href = `/?cerebras=${encodeURIComponent(query)}&cached=1`;
    }
  });

  // Helper to restore all buttons
  const restoreButtons = () => {
    const exploreIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
        <path d="M20 3v4"></path>
        <path d="M22 5h-4"></path>
        <path d="M4 17v2"></path>
        <path d="M5 18H3"></path>
      </svg>
      <span>Explore</span>
    `;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = exploreIcon;
    }
    if (input) {
      input.disabled = false;
    }
    if (headerBtn) {
      headerBtn.disabled = false;
      headerBtn.innerHTML = headerBtnOriginalHTML || exploreIcon;
    }
    if (headerInput) {
      headerInput.disabled = false;
    }
    document.querySelectorAll('.suggestion-chip').forEach((chip) => {
      chip.disabled = false;
      chip.style.pointerEvents = '';
      chip.style.opacity = '';
    });
  };

  eventSource.addEventListener('error', (e) => {
    eventSource.close();
    restoreButtons();

    // Show error message
    if (e.data) {
      const data = JSON.parse(e.data);
      alert(`Generation failed: ${data.message}`);
    }
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      // Connection closed unexpectedly
      if (generatedBlocks.length === 0) {
        restoreButtons();
      }
    }
  };
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
