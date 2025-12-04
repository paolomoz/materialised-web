/**
 * Cerebras Generated Block
 *
 * This block is placed on placeholder DA pages to stream content from the
 * generative worker on first render. Once content is generated and persisted,
 * this block is replaced with the actual generated content.
 *
 * Flow:
 * 1. User searches on homepage → worker creates DA page with this block
 * 2. User redirected to DA page → this block reads query/slug from metadata
 * 3. Block connects to worker SSE stream → renders blocks as they arrive
 * 4. Images show shimmer placeholders → replaced when ready
 * 5. Worker persists final content to DA → subsequent visits load normal page
 */

import {
  decorateBlock,
  loadBlock,
  decorateButtons,
  decorateIcons,
  loadCSS,
} from '../../scripts/aem.js';

// Worker URL for Cerebras-powered generation
const CEREBRAS_WORKER_URL = 'https://vitamix-generative-cerebras.paolo-moz.workers.dev';

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Decorate the cerebras-generated block
 * @param {HTMLElement} block - The block element
 */
export default async function decorate(block) {
  // Load skeleton CSS for loading states
  await loadCSS(`${window.hlx.codeBasePath}/styles/skeleton.css`);

  // Get query/slug from block content (two rows: query, slug)
  const rows = [...block.querySelectorAll(':scope > div')];
  const query = rows[0]?.textContent?.trim();
  const slug = rows[1]?.textContent?.trim();

  // Also check page metadata as fallback
  const metaQuery = document.querySelector('meta[name="cerebras-query"]')?.content;
  const metaSlug = document.querySelector('meta[name="cerebras-slug"]')?.content;
  const sourceOrigin = document.querySelector('meta[name="cerebras-source"]')?.content
    || window.location.origin;

  const finalQuery = query || metaQuery;
  const finalSlug = slug || metaSlug;

  // If no query/slug, this page already has content - remove placeholder block
  if (!finalQuery || !finalSlug) {
    block.remove();
    return;
  }

  // Show loading state
  block.innerHTML = `
    <div class="cerebras-loading">
      <div class="cerebras-loading-content">
        <h2>Creating Your Personalized Page</h2>
        <p class="cerebras-query">"${finalQuery}"</p>
        <div class="progress-indicator">
          <div class="progress-dot"></div>
          <div class="progress-dot"></div>
          <div class="progress-dot"></div>
        </div>
        <p class="cerebras-status">Connecting...</p>
      </div>
    </div>
  `;

  const statusEl = block.querySelector('.cerebras-status');
  const main = document.querySelector('main');
  const parentSection = block.closest('.section');

  // Track generated blocks for persistence
  const generatedBlocks = [];
  let blockCount = 0;

  // Connect to worker SSE stream
  const streamUrl = `${CEREBRAS_WORKER_URL}/api/stream?slug=${encodeURIComponent(finalSlug)}&query=${encodeURIComponent(finalQuery)}`;

  // eslint-disable-next-line no-console
  console.log('[cerebras-generated] Connecting to stream:', streamUrl);

  const eventSource = new EventSource(streamUrl);

  eventSource.onopen = () => {
    statusEl.textContent = 'Generating content...';
    // eslint-disable-next-line no-console
    console.log('[cerebras-generated] Stream connected');
  };

  eventSource.addEventListener('layout', (e) => {
    const data = JSON.parse(e.data);
    statusEl.textContent = `Generating ${data.blocks.length} sections...`;
  });

  eventSource.addEventListener('block-start', (e) => {
    const data = JSON.parse(e.data);
    statusEl.textContent = `Creating ${data.blockType}...`;
  });

  eventSource.addEventListener('block-content', async (e) => {
    const data = JSON.parse(e.data);

    // Hide loading state after first block
    if (blockCount === 0) {
      block.querySelector('.cerebras-loading').style.display = 'none';
    }
    blockCount += 1;

    // Store HTML and sectionStyle for persistence
    generatedBlocks.push({ html: data.html, sectionStyle: data.sectionStyle });

    // Create section and add content
    const section = document.createElement('div');
    section.className = 'section';
    // Apply section style (highlight, dark) if provided
    if (data.sectionStyle && data.sectionStyle !== 'default') {
      section.classList.add(data.sectionStyle);
    }
    section.dataset.sectionStatus = 'initialized';
    section.innerHTML = data.html;

    // Store original src for each generated image (before any decoration)
    section.querySelectorAll('img[data-gen-image]').forEach((img) => {
      img.dataset.originalSrc = img.getAttribute('src');
    });

    // Wrap block in a wrapper div (EDS pattern)
    const blockEl = section.querySelector('[class]');
    if (blockEl) {
      const blockName = blockEl.classList[0];
      // Create wrapper
      const wrapper = document.createElement('div');
      wrapper.className = `${blockName}-wrapper`;
      blockEl.parentNode.insertBefore(wrapper, blockEl);
      wrapper.appendChild(blockEl);

      // Decorate the block (adds .block class, data-block-name, wraps text nodes)
      decorateBlock(blockEl);

      // Add container class to section
      section.classList.add(`${blockName}-container`);
    }

    // Decorate buttons and icons
    decorateButtons(section);
    decorateIcons(section);

    // Insert section before the placeholder block's section
    parentSection.parentNode.insertBefore(section, parentSection);

    // Now load the block (CSS + JS module)
    const blockToLoad = section.querySelector('.block');
    if (blockToLoad) {
      await loadBlock(blockToLoad);
    }

    // Mark section as loaded
    section.dataset.sectionStatus = 'loaded';
    section.style.display = null;
  });

  // Handle image-ready events - update image src and trigger loaded animation
  eventSource.addEventListener('image-ready', (e) => {
    const data = JSON.parse(e.data);
    const { imageId, url } = data;

    // Resolve relative URLs to absolute worker URLs
    let resolvedUrl = url;
    if (url && url.startsWith('/')) {
      resolvedUrl = `${CEREBRAS_WORKER_URL}${url}`;
    }

    // eslint-disable-next-line no-console
    console.log('[cerebras-generated] Image ready:', imageId, resolvedUrl);

    // Find the image with matching data-gen-image attribute
    const img = main.querySelector(`img[data-gen-image="${imageId}"]`);
    if (img && resolvedUrl) {
      // Get references before modifying DOM
      const originalUrl = img.dataset.originalSrc;
      const imgSection = img.closest('.section');
      const imgParent = img.parentNode;

      // Force browser to reload image by replacing the element
      // (browser's in-memory image cache ignores query string cache-busting)
      const cacheBustUrl = resolvedUrl.includes('?')
        ? `${resolvedUrl}&_t=${Date.now()}`
        : `${resolvedUrl}?_t=${Date.now()}`;

      // Create new image element to bypass browser's image cache
      const newImg = document.createElement('img');
      newImg.src = cacheBustUrl;
      newImg.alt = img.alt || '';
      newImg.className = img.className;
      if (img.loading) newImg.loading = img.loading;
      // Mark as loaded immediately - triggers CSS transition
      newImg.classList.add('loaded');

      // Replace old image with new one
      if (imgParent) {
        imgParent.replaceChild(newImg, img);
      }

      // Update the generatedBlocks array for persistence
      if (imgSection && originalUrl) {
        // Find which generated block this section corresponds to
        const sections = [...main.querySelectorAll('.section:not(:has(.cerebras-generated))')];
        const sectionIndex = sections.indexOf(imgSection);
        if (sectionIndex >= 0 && generatedBlocks[sectionIndex]) {
          // Replace the placeholder URL with the actual URL in stored HTML
          generatedBlocks[sectionIndex].html = generatedBlocks[sectionIndex].html.replace(
            new RegExp(escapeRegExp(originalUrl), 'g'),
            resolvedUrl,
          );
        }
      }
    }
  });

  eventSource.addEventListener('generation-complete', (e) => {
    eventSource.close();
    // eslint-disable-next-line no-console
    console.log('[cerebras-generated] Generation complete:', e.data);

    // Update document title
    const h1 = main.querySelector('h1');
    if (h1) {
      document.title = `${h1.textContent} | Vitamix`;
    }

    // Remove placeholder block and its section
    parentSection.remove();
  });

  eventSource.addEventListener('error', (e) => {
    let errorMessage = 'Something went wrong during generation.';
    if (e.data) {
      try {
        const data = JSON.parse(e.data);
        errorMessage = data.message || errorMessage;
      } catch {
        // Not JSON error
      }
    }

    // eslint-disable-next-line no-console
    console.error('[cerebras-generated] Stream error:', errorMessage);

    block.innerHTML = `
      <div class="cerebras-error">
        <h2>Generation Failed</h2>
        <p>${errorMessage}</p>
        <div class="cerebras-error-actions">
          <button class="button cerebras-retry-btn">Try Again</button>
          <a href="/" class="button secondary">Return to Homepage</a>
        </div>
      </div>
    `;

    // Handle retry
    block.querySelector('.cerebras-retry-btn')?.addEventListener('click', () => {
      window.location.reload();
    });

    eventSource.close();
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      if (blockCount === 0) {
        statusEl.textContent = 'Connection failed. Please try again.';
        block.innerHTML = `
          <div class="cerebras-error">
            <h2>Connection Failed</h2>
            <p>Unable to connect to the generation service.</p>
            <div class="cerebras-error-actions">
              <button class="button cerebras-retry-btn">Try Again</button>
              <a href="/" class="button secondary">Return to Homepage</a>
            </div>
          </div>
        `;

        block.querySelector('.cerebras-retry-btn')?.addEventListener('click', () => {
          window.location.reload();
        });
      }
    }
  };
}
