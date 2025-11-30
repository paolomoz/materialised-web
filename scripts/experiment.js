/**
 * Progressive Rendering Experiment
 *
 * This script handles the experimental ?experiment= flow where blocks
 * are rendered one at a time AS THEY ARRIVE from the existing SSE stream,
 * creating a progressive experience where users see content immediately.
 *
 * Key insight: The worker ALREADY streams blocks one at a time.
 * This experiment changes the FRONTEND to render each block immediately
 * instead of waiting for all blocks to complete.
 */

import {
  decorateBlock,
  loadBlock,
  decorateButtons,
  decorateIcons,
  loadCSS,
  loadHeader,
  loadFooter,
  decorateTemplateAndTheme,
} from './aem.js';

// Use the SAME worker as the current flow - no separate worker needed
const GENERATIVE_WORKER_URL = 'https://vitamix-generative.paolo-moz.workers.dev';

/**
 * Check if this is an experiment request (has ?experiment= param)
 */
export function isExperimentRequest() {
  return new URLSearchParams(window.location.search).has('experiment');
}

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

  // Add short hash for uniqueness
  let hash = 0;
  const str = query + Date.now();
  for (let i = 0; i < str.length; i += 1) {
    const char = str.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash = ((hash << 5) - hash) + char;
    // eslint-disable-next-line no-bitwise
    hash &= hash;
  }
  const hashStr = Math.abs(hash).toString(36).slice(0, 6);
  return `${slug}-${hashStr}`;
}

/**
 * Animate a block appearing
 */
function animateBlockAppear(section) {
  section.style.opacity = '0';
  section.style.transform = 'translateY(20px)';
  section.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';

  // Trigger animation on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      section.style.opacity = '1';
      section.style.transform = 'translateY(0)';
    });
  });
}

/**
 * Render the progressive generation page
 */
export async function renderProgressivePage() {
  // Load skeleton styles
  await loadCSS(`${window.hlx.codeBasePath}/styles/skeleton.css`);
  await loadCSS(`${window.hlx.codeBasePath}/styles/experiment.css`);

  const main = document.querySelector('main');
  if (!main) return;

  const query = new URLSearchParams(window.location.search).get('experiment');
  const slug = generateSlug(query);

  // Clear main and show minimal loading state
  main.innerHTML = `
    <div class="section experiment-loading">
      <div class="experiment-status">
        <div class="experiment-pulse"></div>
        <p class="experiment-query">"${query}"</p>
        <p class="experiment-message">Connecting...</p>
      </div>
    </div>
    <div id="progressive-content"></div>
  `;

  const loadingState = main.querySelector('.experiment-loading');
  const statusMessage = main.querySelector('.experiment-message');
  const content = main.querySelector('#progressive-content');

  // Connect to the SAME SSE stream as current flow - just render differently
  const streamUrl = `${GENERATIVE_WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}`;
  const eventSource = new EventSource(streamUrl);
  let blockCount = 0;
  let totalBlocks = 0;
  const generatedBlocks = [];

  eventSource.onopen = () => {
    statusMessage.textContent = 'Generating your page...';
  };

  // Layout event - tells us how many blocks to expect
  // Uses SAME event name as current worker
  eventSource.addEventListener('layout', (e) => {
    const data = JSON.parse(e.data);
    totalBlocks = data.blocks?.length || 0;
    statusMessage.textContent = `Creating ${totalBlocks} sections...`;

    // eslint-disable-next-line no-console
    console.log('Progressive layout:', data);
  });

  // Block content event - a new block is ready to render
  // This is the KEY DIFFERENCE from scripts.js - we render IMMEDIATELY instead of waiting
  eventSource.addEventListener('block-content', async (e) => {
    const data = JSON.parse(e.data);
    const { blockId, html, sectionStyle } = data;

    // eslint-disable-next-line no-console
    console.log(`Block ${blockCount + 1}/${totalBlocks}: ${blockId}`);

    // Hide loading state after first block
    if (blockCount === 0) {
      loadingState.style.display = 'none';
    }
    blockCount += 1;

    // Store for potential persistence
    generatedBlocks.push({ html, sectionStyle });

    // Create section element
    const section = document.createElement('div');
    section.className = 'section';

    // Apply section style (highlight, dark)
    if (sectionStyle && sectionStyle !== 'default') {
      section.classList.add(sectionStyle);
    }

    section.dataset.sectionStatus = 'initialized';
    section.innerHTML = html;

    // Store original src for each generated image
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

      // Decorate the block
      decorateBlock(blockEl);

      // Add container class to section
      section.classList.add(`${blockName}-container`);
    }

    // Decorate buttons and icons
    decorateButtons(section);
    decorateIcons(section);

    // Append to DOM
    content.appendChild(section);

    // Animate appearance
    animateBlockAppear(section);

    // Load the block (CSS + JS module)
    const block = section.querySelector('.block');
    if (block) {
      await loadBlock(block);
    }

    // Mark section as loaded
    section.dataset.sectionStatus = 'loaded';

    // Update status
    statusMessage.textContent = `Created ${blockCount} of ${totalBlocks} sections...`;
  });

  // Image ready event - same as current worker
  eventSource.addEventListener('image-ready', (e) => {
    const data = JSON.parse(e.data);
    const { imageId, url } = data;

    // Resolve relative URLs
    let resolvedUrl = url;
    if (url && url.startsWith('/')) {
      resolvedUrl = `${GENERATIVE_WORKER_URL}${url}`;
    }

    // Find and update the image
    const img = content.querySelector(`img[data-gen-image="${imageId}"]`);
    if (img && resolvedUrl) {
      const originalUrl = img.dataset.originalSrc;
      img.src = resolvedUrl;
      img.classList.add('loaded');

      // Update stored HTML for persistence
      const section = img.closest('.section');
      if (section && originalUrl) {
        const sectionIndex = Array.from(content.children).indexOf(section);
        if (sectionIndex >= 0 && generatedBlocks[sectionIndex]) {
          generatedBlocks[sectionIndex].html = generatedBlocks[sectionIndex].html.replace(
            new RegExp(escapeRegExp(originalUrl), 'g'),
            resolvedUrl,
          );
        }
      }
    }
  });

  // Generation complete event - same as current worker
  eventSource.addEventListener('generation-complete', (e) => {
    eventSource.close();

    const data = JSON.parse(e.data);
    // eslint-disable-next-line no-console
    console.log('Progressive generation complete:', data);

    // Update document title
    const h1 = content.querySelector('h1');
    if (h1) {
      document.title = `${h1.textContent} | Vitamix`;
    }

    // Show completion indicator briefly
    const completeIndicator = document.createElement('div');
    completeIndicator.className = 'experiment-complete';
    completeIndicator.innerHTML = `
      <div class="experiment-complete-icon">✓</div>
      <p>Page generated in ${blockCount} sections</p>
    `;
    content.appendChild(completeIndicator);
    animateBlockAppear(completeIndicator);

    // Fade out after 3 seconds
    setTimeout(() => {
      completeIndicator.style.opacity = '0';
      setTimeout(() => completeIndicator.remove(), 400);
    }, 3000);
  });

  // Error event
  eventSource.addEventListener('error', (e) => {
    if (e.data) {
      const data = JSON.parse(e.data);
      loadingState.innerHTML = `
        <div class="experiment-error">
          <h2>Something went wrong</h2>
          <p>${data.message}</p>
          <p><a href="/">Return to homepage</a></p>
        </div>
      `;
      loadingState.style.display = 'block';
    }
    eventSource.close();
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      if (blockCount === 0) {
        statusMessage.textContent = 'Connection failed. Please try again.';
      }
    }
  };
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Initialize the experiment if applicable
 */
export async function initExperiment() {
  if (!isExperimentRequest()) return false;

  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  document.body.classList.add('appear', 'experiment-mode');

  loadHeader(document.querySelector('header'));
  loadFooter(document.querySelector('footer'));

  await renderProgressivePage();
  return true;
}
