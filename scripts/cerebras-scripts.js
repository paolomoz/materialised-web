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
 * Start generation from homepage using SSE streaming flow
 *
 * Flow:
 * 1. Start SSE connection to worker
 * 2. Cache blocks in sessionStorage as they arrive
 * 3. Navigate to /?cerebras=query&cached=1 after first block
 * 4. New page reads cache and renders immediately
 */
async function startGeneration(query) {
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

  console.log(`[Cerebras] Starting generation`);
  console.log(`[Cerebras] Query: "${query}", Images: ${imageProvider}`);

  const slug = generateSlug(query);
  const startTime = Date.now();
  const blocks = [];
  let expectedBlocks = 0;
  let hasNavigated = false;

  // Connect to SSE stream
  const streamUrl = `${CEREBRAS_WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}&images=${imageProvider}`;
  const eventSource = new EventSource(streamUrl);

  eventSource.addEventListener('layout', (e) => {
    const data = JSON.parse(e.data);
    expectedBlocks = data.blocks.length;
    console.log(`[Cerebras] Layout: ${expectedBlocks} blocks`);
  });

  eventSource.addEventListener('block-content', (e) => {
    const data = JSON.parse(e.data);
    blocks.push(data);
    console.log(`[Cerebras] Block ${blocks.length}/${expectedBlocks}: ${data.blockType}`);

    // Navigate after first block arrives
    if (!hasNavigated) {
      hasNavigated = true;
      // Store blocks in sessionStorage for the new page to read
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        blocks,
        query,
        slug,
        startTime,
        expectedBlocks,
        imageProvider,
      }));
      // Navigate with cached flag
      window.location.href = `/?cerebras=${encodeURIComponent(query)}&images=${imageProvider}&cached=1`;
    } else {
      // Update cache with new block
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        blocks,
        query,
        slug,
        startTime,
        expectedBlocks,
        imageProvider,
      }));
    }
  });

  eventSource.addEventListener('error', (e) => {
    // Ignore errors if we've already navigated (expected when page unloads)
    if (hasNavigated) {
      eventSource.close();
      return;
    }

    let errorMessage = 'Something went wrong during generation.';
    if (e.data) {
      try {
        const data = JSON.parse(e.data);
        errorMessage = data.message || errorMessage;
      } catch {
        // Not JSON error
      }
    }
    console.error('[Cerebras] Error:', errorMessage);
    eventSource.close();

    // Re-enable UI on error
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Explore</span>`;
    }
    if (input) {
      input.disabled = false;
    }
    if (headerBtn) {
      headerBtn.disabled = false;
      headerBtn.innerHTML = `<span>Explore</span>`;
    }
    if (headerInput) {
      headerInput.disabled = false;
    }
    document.querySelectorAll('.suggestion-chip').forEach((chip) => {
      chip.disabled = false;
      chip.style.pointerEvents = '';
      chip.style.opacity = '';
    });
    // eslint-disable-next-line no-alert
    alert(`Error: ${errorMessage}`);
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED && !hasNavigated) {
      console.error('[Cerebras] Connection closed before navigation');
      // Re-enable UI
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Explore</span>`;
      }
      if (input) {
        input.disabled = false;
      }
      if (headerBtn) {
        headerBtn.disabled = false;
        headerBtn.innerHTML = `<span>Explore</span>`;
      }
      if (headerInput) {
        headerInput.disabled = false;
      }
      document.querySelectorAll('.suggestion-chip').forEach((chip) => {
        chip.disabled = false;
        chip.style.pointerEvents = '';
        chip.style.opacity = '';
      });
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
 * Add Save to DA button in header for generated pages
 */
function addSaveButton() {
  const header = document.querySelector('header');
  if (!header) return;

  // Check if button already exists
  if (header.querySelector('.save-to-da-btn')) return;

  // Find the quality toggle container to place button nearby
  const qualityToggle = header.querySelector('.nav-quality-toggle');
  if (!qualityToggle) return;

  // Create save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-to-da-btn';
  saveBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
    <span>Save</span>
  `;

  saveBtn.addEventListener('click', saveToDA);

  // Insert before quality toggle
  qualityToggle.parentNode.insertBefore(saveBtn, qualityToggle);
}

/**
 * Save current generated page to DA
 */
async function saveToDA() {
  const saveBtn = document.querySelector('.save-to-da-btn');
  if (!saveBtn) return;

  const params = new URLSearchParams(window.location.search);
  const query = params.get('cerebras');
  if (!query) {
    // eslint-disable-next-line no-alert
    alert('No generated content to save.');
    return;
  }

  // Show saving state
  const originalHTML = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = `
    <div class="generating-spinner"></div>
    <span>Saving...</span>
  `;

  try {
    // Collect HTML from each section in main
    const main = document.querySelector('main');
    const sections = main.querySelectorAll('#generation-content > .section');
    const htmlBlocks = [...sections].map((section) => section.innerHTML);

    if (htmlBlocks.length === 0) {
      throw new Error('No generated content found');
    }

    // Generate slug from query
    const slug = generateSlug(query);

    // Call worker API to persist
    const response = await fetch(`${CEREBRAS_WORKER_URL}/api/persist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, query, html: htmlBlocks }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to save');
    }

    // Show success state
    saveBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>Saved!</span>
    `;
    saveBtn.classList.add('saved');

    // eslint-disable-next-line no-console
    console.log('[Cerebras] Page saved to DA:', result.urls);

    // Optionally redirect to the saved page after a delay
    setTimeout(() => {
      if (result.urls?.live) {
        window.location.href = result.urls.live;
      }
    }, 1500);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Cerebras] Failed to save:', error);
    // eslint-disable-next-line no-alert
    alert(`Failed to save: ${error.message}`);

    // Restore button
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalHTML;
  }
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
    // Add save button after rendering
    addSaveButton();
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
