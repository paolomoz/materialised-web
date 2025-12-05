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
import { SessionContextManager } from './session-context.js';

// Cerebras worker URL
const CEREBRAS_WORKER_URL = 'https://vitamix-generative-cerebras.paolo-moz.workers.dev';

// Store original block data for publishing (before decoration)
let originalBlocksData = [];

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

  // Store original src for each generated image and add load handler
  section.querySelectorAll('img[data-gen-image]').forEach((img) => {
    img.dataset.originalSrc = img.getAttribute('src');

    // Add onload handler to show image when it loads
    img.onload = () => {
      img.classList.add('loaded');
    };

    // If image is already loaded, add class immediately
    if (img.complete && img.naturalWidth > 0) {
      img.classList.add('loaded');
    }
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
 * Render the Cerebras generative page by streaming from SSE
 */
async function renderCerebrasPage() {
  const main = document.querySelector('main');
  if (!main) return;

  const params = new URLSearchParams(window.location.search);
  const query = params.get('cerebras');
  if (!query) return;

  const slug = generateSlug(query);
  const startTime = Date.now();

  // Show loading state while waiting for SSE to connect
  main.innerHTML = `
    <div id="generation-content">
      <div class="generating-container">
        <h1 class="generating-title">Creating your personalized page...</h1>
        <p class="generating-query">"${query}"</p>
        <div class="progress-indicator">
          <div class="progress-dot"></div>
          <div class="progress-dot"></div>
          <div class="progress-dot"></div>
        </div>
      </div>
    </div>
  `;
  const content = main.querySelector('#generation-content');

  // Reset original blocks storage for this generation
  originalBlocksData = [];

  // Build session context for the request
  const contextParam = SessionContextManager.buildEncodedContextParam();

  // Connect to SSE stream with session context
  const streamUrl = `${CEREBRAS_WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}&ctx=${contextParam}`;
  const eventSource = new EventSource(streamUrl);

  console.log(`[Cerebras] Starting SSE stream for: ${query}`);

  // Track if first block has arrived
  let firstBlockReceived = false;

  eventSource.addEventListener('block-content', async (e) => {
    // Remove loading indicator on first block
    if (!firstBlockReceived) {
      firstBlockReceived = true;
      const loadingContainer = content.querySelector('.generating-container');
      if (loadingContainer) {
        loadingContainer.remove();
      }
    }

    const data = JSON.parse(e.data);
    // Store original block data for publishing
    originalBlocksData.push(data);
    await renderBlockSection(data, content);
  });

  // Queue for pending image updates (handles race condition with block decoration)
  const pendingImages = new Map();

  // Function to apply image update
  function applyImageUpdate(imageId, url, cropNeeded) {
    const img = content.querySelector(`img[data-gen-image="${imageId}"]`);
    if (img && url) {
      // Resolve relative URLs to absolute worker URLs
      let resolvedUrl = url;
      if (url.startsWith('/')) {
        resolvedUrl = `${CEREBRAS_WORKER_URL}${url}`;
      }

      // Cache-bust to ensure fresh load
      const cacheBustUrl = resolvedUrl.includes('?')
        ? `${resolvedUrl}&_t=${Date.now()}`
        : `${resolvedUrl}?_t=${Date.now()}`;

      // Update src directly instead of replacing element
      img.src = cacheBustUrl;
      if (cropNeeded) img.dataset.crop = 'true';
      img.classList.add('loaded');

      // Also update the original blocks data for publishing
      const originalUrl = img.dataset.originalSrc;
      if (originalUrl) {
        originalBlocksData.forEach((block) => {
          block.html = block.html.replace(
            new RegExp(escapeRegExp(originalUrl), 'g'),
            resolvedUrl,
          );
        });
      }
      return true;
    }
    return false;
  }

  // Retry pending images periodically
  const retryInterval = setInterval(() => {
    if (pendingImages.size === 0) return;

    pendingImages.forEach(({ url, cropNeeded, attempts }, imageId) => {
      if (applyImageUpdate(imageId, url, cropNeeded)) {
        console.log(`[Cerebras] Image applied (retry): ${imageId}`);
        pendingImages.delete(imageId);
      } else if (attempts >= 20) {
        // Give up after 20 attempts (2 seconds)
        console.warn(`[Cerebras] Image not found after retries: ${imageId}`);
        pendingImages.delete(imageId);
      } else {
        pendingImages.set(imageId, { url, cropNeeded, attempts: attempts + 1 });
      }
    });
  }, 100);

  // Handle image-ready events - update image src when resolved
  eventSource.addEventListener('image-ready', (e) => {
    const data = JSON.parse(e.data);
    const { imageId, url, cropNeeded } = data;

    console.log(`[Cerebras] Image ready: ${imageId}`);

    // Try to apply immediately, queue for retry if element not found
    if (!applyImageUpdate(imageId, url, cropNeeded)) {
      pendingImages.set(imageId, { url, cropNeeded, attempts: 0 });
    }
  });

  eventSource.addEventListener('generation-complete', (e) => {
    eventSource.close();
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Clear retry interval after a delay to allow final retries
    setTimeout(() => clearInterval(retryInterval), 2000);

    console.log(`[Cerebras] Complete in ${totalTime}s`);

    // Parse intent data if available
    let intent = null;
    if (e.data) {
      try {
        const data = JSON.parse(e.data);
        intent = data.intent;
      } catch {
        // No intent data
      }
    }

    // Record this query in session context
    SessionContextManager.addQuery({
      query,
      timestamp: Date.now(),
      intent: intent?.intentType || 'general',
      entities: intent?.entities || { products: [], ingredients: [], goals: [] },
      generatedPath: `/discover/${slug}`,
    });

    console.log(`[Cerebras] Session context updated, total queries: ${SessionContextManager.getContext().queries.length}`);

    // Update title
    const h1 = content.querySelector('h1');
    if (h1) {
      document.title = `${h1.textContent} | Vitamix (Cerebras)`;
    }

    // Show publish button now that generation is complete
    addPublishButton();
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
 * Transform current page into generation page when first block arrives
 */
async function transformToGenerationPage(query, slug, eventSource, initialBlocks) {
  const main = document.querySelector('main');
  if (!main) return;

  const startTime = Date.now();

  // Update URL without navigation
  const newUrl = `/?cerebras=${encodeURIComponent(query)}`;
  window.history.pushState({ cerebras: query }, '', newUrl);

  // Replace page content
  main.innerHTML = '<div id="generation-content"></div>';
  const content = main.querySelector('#generation-content');

  // Reset original blocks storage
  originalBlocksData = [];

  // Load cerebras CSS
  await loadCSS('/styles/cerebras.css');

  // Render initial blocks that arrived before page transform
  for (const blockData of initialBlocks) {
    originalBlocksData.push(blockData);
    await renderBlockSection(blockData, content);
  }

  // Queue for pending image updates (handles race condition with block decoration)
  const pendingImages = new Map();

  // Function to apply image update
  function applyImageUpdate(imageId, url, cropNeeded) {
    const img = content.querySelector(`img[data-gen-image="${imageId}"]`);
    if (img && url) {
      // Resolve relative URLs to absolute worker URLs
      let resolvedUrl = url;
      if (url.startsWith('/')) {
        resolvedUrl = `${CEREBRAS_WORKER_URL}${url}`;
      }

      const cacheBustUrl = resolvedUrl.includes('?')
        ? `${resolvedUrl}&_t=${Date.now()}`
        : `${resolvedUrl}?_t=${Date.now()}`;

      img.src = cacheBustUrl;
      if (cropNeeded) img.dataset.crop = 'true';
      img.classList.add('loaded');

      const originalUrl = img.dataset.originalSrc;
      if (originalUrl) {
        originalBlocksData.forEach((block) => {
          block.html = block.html.replace(
            new RegExp(escapeRegExp(originalUrl), 'g'),
            resolvedUrl,
          );
        });
      }
      return true;
    }
    return false;
  }

  // Retry pending images periodically
  const retryInterval = setInterval(() => {
    if (pendingImages.size === 0) return;

    pendingImages.forEach(({ url, cropNeeded, attempts }, imageId) => {
      if (applyImageUpdate(imageId, url, cropNeeded)) {
        console.log(`[Cerebras] Image applied (retry): ${imageId}`);
        pendingImages.delete(imageId);
      } else if (attempts >= 20) {
        console.warn(`[Cerebras] Image not found after retries: ${imageId}`);
        pendingImages.delete(imageId);
      } else {
        pendingImages.set(imageId, { url, cropNeeded, attempts: attempts + 1 });
      }
    });
  }, 100);

  // Continue listening for more blocks
  eventSource.addEventListener('block-content', async (e) => {
    const data = JSON.parse(e.data);
    originalBlocksData.push(data);
    await renderBlockSection(data, content);
  });

  // Handle image-ready events
  eventSource.addEventListener('image-ready', (e) => {
    const data = JSON.parse(e.data);
    const { imageId, url, cropNeeded } = data;

    console.log(`[Cerebras] Image ready: ${imageId}`);

    if (!applyImageUpdate(imageId, url, cropNeeded)) {
      pendingImages.set(imageId, { url, cropNeeded, attempts: 0 });
    }
  });

  eventSource.addEventListener('generation-complete', (e) => {
    eventSource.close();
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    setTimeout(() => clearInterval(retryInterval), 2000);

    console.log(`[Cerebras] Complete in ${totalTime}s`);

    // Re-enable header search input and button
    const headerEl = document.querySelector('header');
    if (headerEl) {
      const headerInput = headerEl.querySelector('input[type="text"], input[type="search"], input:not([type])');
      const headerBtn = headerEl.querySelector('.header-explore-btn');
      if (headerInput) headerInput.disabled = false;
      if (headerBtn) {
        headerBtn.disabled = false;
        headerBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
            <path d="M20 3v4"></path>
            <path d="M22 5h-4"></path>
            <path d="M4 17v2"></path>
            <path d="M5 18H3"></path>
          </svg>
          <span>Explore</span>
        `;
      }
    }

    let intent = null;
    if (e.data) {
      try {
        const data = JSON.parse(e.data);
        intent = data.intent;
      } catch {
        // No intent data
      }
    }

    SessionContextManager.addQuery({
      query,
      timestamp: Date.now(),
      intent: intent?.intentType || 'general',
      entities: intent?.entities || { products: [], ingredients: [], goals: [] },
      generatedPath: `/discover/${slug}`,
    });

    console.log(`[Cerebras] Session context updated, total queries: ${SessionContextManager.getContext().queries.length}`);

    const h1 = content.querySelector('h1');
    if (h1) {
      document.title = `${h1.textContent} | Vitamix`;
    }

    addPublishButton();
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
}

/**
 * Start generation - stream content before navigating
 * Exposed globally as window.startCerebrasGeneration for use by blocks
 */
function startGeneration(query) {
  // Show loading state on any button that triggered this
  const header = document.querySelector('header');
  const headerBtn = header ? header.querySelector('button') : null;
  const headerInput = header ? header.querySelector('input[type="text"], input[type="search"], input:not([type])') : null;

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

  console.log(`[Cerebras] Starting generation for query: "${query}"`);

  // Start SSE stream immediately (don't navigate yet)
  const slug = generateSlug(query);
  const contextParam = SessionContextManager.buildEncodedContextParam();
  const streamUrl = `${CEREBRAS_WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}&ctx=${contextParam}`;
  const eventSource = new EventSource(streamUrl);

  let firstBlockReceived = false;
  const pendingBlocks = [];

  eventSource.addEventListener('block-content', (e) => {
    const data = JSON.parse(e.data);
    pendingBlocks.push(data);

    // On first block, transform the page
    if (!firstBlockReceived) {
      firstBlockReceived = true;
      transformToGenerationPage(query, slug, eventSource, pendingBlocks);
    }
  });

  eventSource.addEventListener('error', (e) => {
    if (e.data) {
      const data = JSON.parse(e.data);
      alert(`Generation failed: ${data.message}`);
    }
    eventSource.close();
    // Re-enable UI
    if (headerBtn) {
      headerBtn.disabled = false;
      headerBtn.innerHTML = '<span>EXPLORE</span>';
    }
    if (headerInput) headerInput.disabled = false;
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED && !firstBlockReceived) {
      console.error('[Cerebras] SSE connection failed');
      // Re-enable UI
      if (headerBtn) {
        headerBtn.disabled = false;
        headerBtn.innerHTML = '<span>EXPLORE</span>';
      }
      if (headerInput) headerInput.disabled = false;
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
 * Add Share button in header for generated pages
 */
function addPublishButton() {
  const header = document.querySelector('header');
  if (!header) return;

  // Check if button already exists
  if (header.querySelector('.publish-btn')) return;

  // Find the quality toggle container to place button nearby
  const qualityToggle = header.querySelector('.nav-quality-toggle');
  if (!qualityToggle) {
    // Header may not be fully loaded yet, retry after a short delay
    setTimeout(addPublishButton, 100);
    return;
  }

  // Create share button
  const publishBtn = document.createElement('button');
  publishBtn.className = 'publish-btn';
  publishBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="18" cy="5" r="3"></circle>
      <circle cx="6" cy="12" r="3"></circle>
      <circle cx="18" cy="19" r="3"></circle>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
    </svg>
    <span>Share</span>
  `;

  publishBtn.addEventListener('click', publishToDA);

  // Insert before quality toggle
  qualityToggle.parentNode.insertBefore(publishBtn, qualityToggle);
}

/**
 * Published page URL - stored after successful publish
 */
let publishedPageUrl = null;

/**
 * Publish current generated page to DA
 */
async function publishToDA() {
  const publishBtn = document.querySelector('.publish-btn');
  if (!publishBtn) return;

  const params = new URLSearchParams(window.location.search);
  const query = params.get('cerebras');
  if (!query) {
    // eslint-disable-next-line no-alert
    alert('No generated content to publish.');
    return;
  }

  // Show publishing state
  const originalHTML = publishBtn.innerHTML;
  publishBtn.disabled = true;
  publishBtn.innerHTML = `
    <div class="generating-spinner"></div>
    <span>Publishing...</span>
  `;

  try {
    // Use original block data (before decoration) for publishing
    if (originalBlocksData.length === 0) {
      throw new Error('No generated content found');
    }

    // Get current image URLs from DOM (they may have been updated via image-ready)
    const content = document.querySelector('#generation-content');
    const imageMap = {};
    if (content) {
      content.querySelectorAll('img[data-gen-image]').forEach((img) => {
        const imageId = img.dataset.genImage;
        if (imageId && img.src) {
          imageMap[imageId] = img.src;
        }
      });
    }

    // Update image URLs in original HTML before publishing
    const blocksToPublish = originalBlocksData.map((block) => {
      let { html } = block;
      // Replace placeholder image URLs with final URLs
      Object.entries(imageMap).forEach(([imageId, finalUrl]) => {
        // Match src="/api/images/..." or src="..." patterns for this imageId
        const placeholderPattern = new RegExp(
          `src="[^"]*"([^>]*data-gen-image="${escapeRegExp(imageId)}")`,
          'g',
        );
        html = html.replace(placeholderPattern, `src="${finalUrl}"$1`);
      });
      return { ...block, html };
    });

    // Call worker API to persist (worker will classify and generate path)
    const response = await fetch(`${CEREBRAS_WORKER_URL}/api/persist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, blocks: blocksToPublish }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to publish');
    }

    // Store the published URL
    publishedPageUrl = result.urls?.live;

    // eslint-disable-next-line no-console
    console.log('[Cerebras] Page published to DA:', result.path, result.urls);

    // Show shared state
    publishBtn.className = 'publish-btn published';
    publishBtn.disabled = false;
    publishBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="5" r="3"></circle>
        <circle cx="6" cy="12" r="3"></circle>
        <circle cx="18" cy="19" r="3"></circle>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
      </svg>
      <span>Copy</span>
    `;

    // Change click handler to copy link
    publishBtn.removeEventListener('click', publishToDA);
    publishBtn.addEventListener('click', sharePublishedPage);

    // Open published page in new tab
    if (publishedPageUrl) {
      window.open(publishedPageUrl, '_blank');
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Cerebras] Failed to publish:', error);
    // eslint-disable-next-line no-alert
    alert(`Failed to publish: ${error.message}`);

    // Restore button
    publishBtn.disabled = false;
    publishBtn.innerHTML = originalHTML;
  }
}

/**
 * Share the published page URL (copy to clipboard)
 */
async function sharePublishedPage() {
  if (!publishedPageUrl) {
    // eslint-disable-next-line no-alert
    alert('No published page to share.');
    return;
  }

  try {
    await navigator.clipboard.writeText(publishedPageUrl);
    showCopyNotification('Link copied to clipboard!');
  } catch (error) {
    // Fallback for browsers that don't support clipboard API
    const textArea = document.createElement('textarea');
    textArea.value = publishedPageUrl;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showCopyNotification('Link copied to clipboard!');
  }
}

/**
 * Show a brief notification when URL is copied
 */
function showCopyNotification(message) {
  // Remove any existing notification
  const existing = document.querySelector('.copy-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = 'copy-notification';
  notification.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>${message}</span>
  `;

  document.body.appendChild(notification);

  // Trigger animation
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });

  // Remove after 2 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 2000);
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
 * Setup click handlers for explore CTAs
 * These CTAs trigger new page generation when clicked
 */
function setupExploreCTAs() {
  // Use event delegation with capturing to handle clicks on explore CTAs
  // Capturing mode ensures we intercept before default link behavior
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-cta-type="explore"]');
    if (!link) return;

    // Allow Cmd/Ctrl+click to open in new tab normally
    if (e.metaKey || e.ctrlKey) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    // Get the generation hint from the CTA
    const generationHint = link.dataset.generationHint;
    if (!generationHint) {
      console.warn('[Cerebras] Explore CTA missing generation-hint');
      return;
    }

    console.log(`[Cerebras] Explore CTA clicked: "${generationHint}"`);

    // Show loading state on the button
    link.classList.add('generating');
    link.innerHTML = '<div class="generating-spinner"></div><span>Loading...</span>';

    // Start generation with the hint as the query
    startGeneration(generationHint);
  }, true); // true = capturing phase

  console.log('[Cerebras] Explore CTA handlers attached');
}

/**
 * Initialize
 */
async function init() {
  // Show the body (hidden by default in styles.css)
  document.body.classList.add('appear');

  // Always setup header search (works on all pages)
  setupHeaderSearch();

  // Always setup explore CTA handlers (for contextual browsing)
  setupExploreCTAs();

  // Check if this is a generation request
  if (isCerebrasGeneration()) {
    await loadCSS('/styles/cerebras.css');
    await renderCerebrasPage();
  } else {
    // Setup the form on the homepage
    setupCerebrasForm();
  }
}

// Global image load handler for generated images
// Uses event delegation to catch images created by any block decoration
document.addEventListener('load', (e) => {
  if (e.target.tagName === 'IMG' && e.target.dataset.genImage) {
    e.target.classList.add('loaded');
  }
}, true); // Use capture phase to catch before bubbling

// Expose startGeneration globally for use by blocks
window.startCerebrasGeneration = startGeneration;

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
