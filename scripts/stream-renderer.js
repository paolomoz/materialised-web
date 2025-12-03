/**
 * Stream Renderer
 *
 * Handles SSE connection to the generative worker and renders
 * blocks progressively as they arrive.
 */

import {
  decorateBlock,
  loadBlock,
  decorateButtons,
  decorateIcons,
} from './aem.js';

/**
 * State management for generation
 */
class GenerationState {
  constructor(pageId) {
    this.pageId = pageId;
    this.blocks = new Map();
    this.images = new Map();
    this.status = 'initializing';
    this.startTime = Date.now();
    this.eventSource = null;
    this.reconnectAttempts = 0;
    this.persistKey = `gen-state-${pageId}`;
  }

  persist() {
    const state = {
      pageId: this.pageId,
      blocks: Array.from(this.blocks.entries()),
      images: Array.from(this.images.entries()),
      status: this.status,
      timestamp: Date.now(),
    };
    try {
      sessionStorage.setItem(this.persistKey, JSON.stringify(state));
    } catch (e) {
      // Session storage might be full or unavailable
    }
  }

  static restore(pageId) {
    const key = `gen-state-${pageId}`;
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        const data = JSON.parse(stored);
        // Only restore if recent (within 5 minutes)
        if (Date.now() - data.timestamp < 300000) {
          return data;
        }
      }
    } catch (e) {
      // Session storage not available
    }
    return null;
  }
}

/**
 * Skeleton templates for each block type
 */
const skeletonTemplates = {
  hero: `
    <div class="skeleton skeleton-hero">
      <div class="skeleton-image"></div>
      <div class="skeleton-content">
        <div class="skeleton-title"></div>
        <div class="skeleton-subtitle"></div>
        <div class="skeleton-button"></div>
      </div>
    </div>
  `,
  cards: `
    <div class="skeleton skeleton-cards">
      <div class="skeleton-card"><div class="skeleton-card-image"></div><div class="skeleton-card-content"></div></div>
      <div class="skeleton-card"><div class="skeleton-card-image"></div><div class="skeleton-card-content"></div></div>
      <div class="skeleton-card"><div class="skeleton-card-image"></div><div class="skeleton-card-content"></div></div>
    </div>
  `,
  columns: `
    <div class="skeleton skeleton-columns">
      <div class="skeleton-column"></div>
      <div class="skeleton-column"></div>
    </div>
  `,
  text: `
    <div class="skeleton skeleton-text">
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>
  `,
  cta: `
    <div class="skeleton skeleton-cta">
      <div class="skeleton-title"></div>
      <div class="skeleton-button"></div>
    </div>
  `,
  faq: `
    <div class="skeleton skeleton-faq">
      <div class="skeleton-faq-item"></div>
      <div class="skeleton-faq-item"></div>
      <div class="skeleton-faq-item"></div>
    </div>
  `,
};

/**
 * Create a skeleton placeholder for a block type
 */
function createSkeleton(blockType, blockId) {
  const template = skeletonTemplates[blockType] || skeletonTemplates.text;
  const wrapper = document.createElement('div');
  wrapper.className = 'section generating-section';
  wrapper.dataset.genBlockId = blockId;
  wrapper.dataset.genStatus = 'loading';
  wrapper.innerHTML = template;
  return wrapper;
}

/**
 * Initialize the stream renderer
 */
export function initStreamRenderer(streamUrl, container) {
  const pageId = new URL(streamUrl, window.location.origin).searchParams.get('slug');
  const state = new GenerationState(pageId);

  // Check for restored state
  const restored = GenerationState.restore(pageId);
  if (restored && restored.status === 'complete') {
    // Already complete, just reload
    window.location.reload();
    return;
  }

  // Connect to SSE stream
  connectToStream(streamUrl, state, container);

  // Handle page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.status === 'generating') {
      state.persist();
    }
  });

  // Handle beforeunload
  window.addEventListener('beforeunload', (event) => {
    if (state.status === 'generating') {
      state.persist();
    }
  });

  return state;
}

/**
 * Connect to the SSE stream
 */
function connectToStream(streamUrl, state, container) {
  const eventSource = new EventSource(streamUrl);
  state.eventSource = eventSource;
  state.status = 'generating';

  // Layout event - receive block layout
  eventSource.addEventListener('layout', (event) => {
    const data = JSON.parse(event.data);
    handleLayoutEvent(data, state, container);
  });

  // Block start event
  eventSource.addEventListener('block-start', (event) => {
    const data = JSON.parse(event.data);
    handleBlockStart(data, state, container);
  });

  // Block content event
  eventSource.addEventListener('block-content', (event) => {
    const data = JSON.parse(event.data);
    handleBlockContent(data, state, container);
  });

  // Block complete event
  eventSource.addEventListener('block-complete', (event) => {
    const data = JSON.parse(event.data);
    handleBlockComplete(data, state);
  });

  // Image placeholder event
  eventSource.addEventListener('image-placeholder', (event) => {
    const data = JSON.parse(event.data);
    handleImagePlaceholder(data, state);
  });

  // Image ready event
  eventSource.addEventListener('image-ready', (event) => {
    const data = JSON.parse(event.data);
    handleImageReady(data, state);
  });

  // Generation complete event
  eventSource.addEventListener('generation-complete', (event) => {
    const data = JSON.parse(event.data);
    handleGenerationComplete(data, state, eventSource);
  });

  // Error event
  eventSource.addEventListener('error', (event) => {
    if (event.data) {
      const data = JSON.parse(event.data);
      handleError(data, state, eventSource);
    } else {
      // Connection error - try to reconnect
      handleConnectionError(streamUrl, state, container, eventSource);
    }
  });
}

/**
 * Handle layout event - create skeleton placeholders
 */
function handleLayoutEvent(data, state, container) {
  const { blocks } = data;

  // Clear existing content
  container.innerHTML = '';

  // Create skeleton for each block
  blocks.forEach((blockType, index) => {
    const blockId = `block-${index}`;
    const skeleton = createSkeleton(blockType, blockId);
    container.appendChild(skeleton);
    state.blocks.set(blockId, { type: blockType, status: 'pending' });
  });
}

/**
 * Handle block start event
 */
function handleBlockStart(data, state, container) {
  const { blockId, blockType, position } = data;

  // Find or create the block container
  let blockContainer = container.querySelector(`[data-gen-block-id="${blockId}"]`);

  if (!blockContainer) {
    // Create skeleton if not already present
    blockContainer = createSkeleton(blockType, blockId);

    // Insert at correct position
    const sections = container.querySelectorAll('.section');
    if (position < sections.length) {
      container.insertBefore(blockContainer, sections[position]);
    } else {
      container.appendChild(blockContainer);
    }
  }

  blockContainer.dataset.genStatus = 'loading';
  state.blocks.set(blockId, { type: blockType, status: 'loading' });
}

/**
 * Handle block content event
 */
async function handleBlockContent(data, state, container) {
  const { blockId, html, partial } = data;

  const blockContainer = container.querySelector(`[data-gen-block-id="${blockId}"]`);
  if (!blockContainer) return;

  if (partial) {
    // Partial update - append to existing content
    const existingContent = blockContainer.querySelector('.block-content');
    if (existingContent) {
      existingContent.innerHTML += html;
    }
  } else {
    // Full content - replace
    blockContainer.innerHTML = html;

    // Decorate the block using EDS patterns
    const blockElement = blockContainer.querySelector('[class^="block"]') ||
                        blockContainer.firstElementChild;

    if (blockElement) {
      // Add block class if not present
      const blockInfo = state.blocks.get(blockId);
      if (blockInfo && !blockElement.classList.contains(blockInfo.type)) {
        blockElement.classList.add(blockInfo.type);
        blockElement.classList.add('block');
      }

      // Decorate buttons and icons
      decorateButtons(blockContainer);
      decorateIcons(blockContainer);

      // Load and decorate block
      try {
        decorateBlock(blockElement);
        await loadBlock(blockElement);
      } catch (e) {
        console.warn('Block decoration failed:', e);
      }
    }
  }

  blockContainer.dataset.genStatus = partial ? 'partial' : 'ready';
}

/**
 * Handle block complete event
 */
function handleBlockComplete(data, state) {
  const { blockId } = data;

  const blockInfo = state.blocks.get(blockId);
  if (blockInfo) {
    blockInfo.status = 'complete';
  }

  // Update container status
  const container = document.querySelector(`[data-gen-block-id="${blockId}"]`);
  if (container) {
    container.dataset.genStatus = 'complete';
    container.classList.remove('generating-section');
  }
}

/**
 * Handle image placeholder event
 */
function handleImagePlaceholder(data, state) {
  const { imageId, blockId } = data;

  state.images.set(imageId, {
    blockId,
    status: 'generating',
    url: null,
  });
}

/**
 * Handle image ready event
 */
function handleImageReady(data, state) {
  const { imageId, url } = data;

  const imageInfo = state.images.get(imageId);
  if (imageInfo) {
    imageInfo.status = 'ready';
    imageInfo.url = url;
  }

  // Find and update image in DOM
  const img = document.querySelector(`[data-gen-image="${imageId}"]`);
  if (img) {
    // Force browser to reload image by replacing the element
    // (browser's in-memory image cache ignores query string cache-busting)
    const cacheBustUrl = url.includes('?')
      ? `${url}&_t=${Date.now()}`
      : `${url}?_t=${Date.now()}`;

    const imgParent = img.parentNode;

    // Create new image element to bypass browser's image cache
    const newImg = document.createElement('img');
    newImg.src = cacheBustUrl;
    newImg.alt = img.alt || '';
    newImg.className = img.className;
    if (img.loading) newImg.loading = img.loading;
    newImg.classList.add('loaded');

    // Replace old image with new one
    if (imgParent) {
      imgParent.replaceChild(newImg, img);
    }
  }
}

/**
 * Handle generation complete event
 */
function handleGenerationComplete(data, state, eventSource) {
  const { pageUrl } = data;

  state.status = 'complete';
  state.persist();

  // Close the event source
  eventSource.close();

  // Remove generating indicators
  document.querySelectorAll('.generating-section').forEach((section) => {
    section.classList.remove('generating-section');
  });

  // Optional: Update URL if different
  if (pageUrl && window.location.pathname !== pageUrl) {
    window.history.replaceState({}, '', pageUrl);
  }

  // Dispatch custom event
  window.dispatchEvent(new CustomEvent('generation-complete', {
    detail: { pageUrl },
  }));
}

/**
 * Handle error event
 */
function handleError(data, state, eventSource) {
  const { code, message, recoverable } = data;

  console.error(`Generation error: ${code} - ${message}`);

  if (!recoverable) {
    state.status = 'error';
    eventSource.close();

    // Show error message
    const main = document.querySelector('main');
    if (main) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'generation-error';
      errorDiv.innerHTML = `
        <h2>Something went wrong</h2>
        <p>${message}</p>
        <p><a href="/">Return to homepage</a></p>
      `;
      main.appendChild(errorDiv);
    }
  }
}

/**
 * Handle connection error - attempt reconnect
 */
function handleConnectionError(streamUrl, state, container, eventSource) {
  eventSource.close();

  if (state.reconnectAttempts < 3) {
    state.reconnectAttempts++;
    console.log(`Reconnecting (attempt ${state.reconnectAttempts})...`);

    setTimeout(() => {
      connectToStream(streamUrl, state, container);
    }, 1000 * state.reconnectAttempts);
  } else {
    state.status = 'error';
    console.error('Max reconnection attempts reached');
  }
}

/**
 * Check if current page is a generative page
 */
export function isGenerativePage() {
  return window.location.pathname.startsWith('/discover/');
}

/**
 * Get stream URL for current page
 */
export function getStreamUrl() {
  const slug = window.location.pathname.replace('/discover/', '');
  const query = new URLSearchParams(window.location.search).get('q') || slug.replace(/-/g, ' ');
  return `/api/stream?slug=${slug}&query=${encodeURIComponent(query)}`;
}
