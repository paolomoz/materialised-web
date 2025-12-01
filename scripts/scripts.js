import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateBlock,
  loadBlock,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
} from './aem.js';

// Experiment mode (progressive rendering)
import { isExperimentRequest, initExperiment } from './experiment.js';

// Worker URLs
const GENERATIVE_WORKER_URL = 'https://vitamix-generative.paolo-moz.workers.dev';
const FAST_WORKER_URL = 'https://vitamix-generative-fast.paolo-moz.workers.dev';

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if this is a generation request (has ?generate= param)
 */
function isGenerationRequest() {
  return new URLSearchParams(window.location.search).has('generate');
}

/**
 * Check if this is a fast generation request (has ?fast= param)
 */
function isFastRequest() {
  return new URLSearchParams(window.location.search).has('fast');
}

/**
 * Check if this is a Cerebras generation request (has ?cerebras= param)
 * These are handled by cerebras-scripts.js
 */
function isCerebrasRequest() {
  return new URLSearchParams(window.location.search).has('cerebras');
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
 * Render a generative page from query parameter
 */
async function renderGenerativePage() {
  // Load skeleton styles
  await loadCSS(`${window.hlx.codeBasePath}/styles/skeleton.css`);

  const main = document.querySelector('main');
  if (!main) return;

  const params = new URLSearchParams(window.location.search);
  const query = params.get('generate');
  const images = params.get('images'); // 'fal' for fast, null/undefined for LoRA (default)
  const slug = generateSlug(query);

  // Clear main and show loading state
  main.innerHTML = `
    <div class="section generating-container">
      <h1 class="generating-title">Creating Your Personalized Page</h1>
      <p class="generating-query">"${query}"</p>
      <div class="progress-indicator">
        <div class="progress-dot"></div>
        <div class="progress-dot"></div>
        <div class="progress-dot"></div>
      </div>
      <p class="generation-status">Connecting...</p>
    </div>
    <div id="generation-content"></div>
  `;

  const loadingState = main.querySelector('.generating-container');
  const statusEl = main.querySelector('.generation-status');
  const content = main.querySelector('#generation-content');

  // Connect to SSE stream (include images param if specified)
  const imageParam = images ? `&images=${encodeURIComponent(images)}` : '';
  const streamUrl = `${GENERATIVE_WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}${imageParam}`;
  const eventSource = new EventSource(streamUrl);
  let blockCount = 0;
  let generatedBlocks = []; // Array of { html, sectionStyle }

  eventSource.onopen = () => {
    statusEl.textContent = 'Generating content...';
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
      loadingState.style.display = 'none';
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

    // Append to DOM first
    content.appendChild(section);

    // Now load the block (CSS + JS module)
    const block = section.querySelector('.block');
    if (block) {
      await loadBlock(block);
    }

    // Mark section as loaded and show it
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
      resolvedUrl = `${GENERATIVE_WORKER_URL}${url}`;
    }

    // eslint-disable-next-line no-console
    console.log('Image ready:', imageId, resolvedUrl);

    // Find the image with matching data-gen-image attribute
    const img = content.querySelector(`img[data-gen-image="${imageId}"]`);
    if (img && resolvedUrl) {
      // Get the original placeholder URL before updating
      const originalUrl = img.dataset.originalSrc;

      // Update the src to the actual image URL (either R2 or fallback)
      img.src = resolvedUrl;

      // Also update the generatedBlocks array for persistence
      // Find which block contains this image and update its HTML
      const section = img.closest('.section');
      if (section && originalUrl) {
        const sectionIndex = Array.from(content.children).indexOf(section);
        if (sectionIndex >= 0 && generatedBlocks[sectionIndex]) {
          // Replace the placeholder URL with the actual URL in stored HTML
          generatedBlocks[sectionIndex].html = generatedBlocks[sectionIndex].html.replace(
            new RegExp(escapeRegExp(originalUrl), 'g'),
            resolvedUrl,
          );
        }
      }

      // Mark as loaded - triggers CSS transition
      img.classList.add('loaded');
    }
  });

  eventSource.addEventListener('generation-complete', (e) => {
    eventSource.close();

    // Update document title
    const h1 = content.querySelector('h1');
    if (h1) {
      document.title = `${h1.textContent} | Vitamix`;
    }

    // Add "Save this page" section
    const saveSection = document.createElement('div');
    saveSection.className = 'section save-page-section';
    saveSection.innerHTML = `
      <div class="save-page-container">
        <h3>Like this page?</h3>
        <p>Save it to get a permanent link you can share and revisit.</p>
        <button class="button save-page-btn" data-slug="${slug}" data-query="${encodeURIComponent(query)}">
          Save & Get Permanent Link
        </button>
        <div class="save-status"></div>
      </div>
    `;
    content.appendChild(saveSection);

    // Handle save button click
    const saveBtn = saveSection.querySelector('.save-page-btn');
    const saveStatus = saveSection.querySelector('.save-status');

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      saveStatus.textContent = '';

      try {
        // Build HTML array with section-metadata for DA persistence
        const htmlForPersistence = generatedBlocks.map((block) => {
          let sectionHtml = block.html;
          // Add section-metadata block if section has a non-default style
          if (block.sectionStyle && block.sectionStyle !== 'default') {
            sectionHtml += `
<div class="section-metadata">
  <div>
    <div>style</div>
    <div>${block.sectionStyle}</div>
  </div>
</div>`;
          }
          return sectionHtml;
        });

        const response = await fetch(`${GENERATIVE_WORKER_URL}/api/persist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            query,
            html: htmlForPersistence,
          }),
        });

        const result = await response.json();

        if (result.success) {
          const permanentUrl = `${window.location.origin}/discover/${slug}`;
          saveSection.innerHTML = `
            <div class="save-page-container save-success">
              <h3>Page Saved!</h3>
              <p>Your permanent link:</p>
              <a href="/discover/${slug}" class="permanent-link">${permanentUrl}</a>
              <button class="button copy-link-btn" onclick="navigator.clipboard.writeText('${permanentUrl}'); this.textContent='Copied!'">
                Copy Link
              </button>
            </div>
          `;
        } else {
          throw new Error(result.error || 'Failed to save');
        }
      } catch (error) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Get Permanent Link';
        saveStatus.textContent = `Error: ${error.message}. Please try again.`;
        saveStatus.style.color = '#c00';
      }
    });
  });

  eventSource.addEventListener('error', (e) => {
    if (e.data) {
      const data = JSON.parse(e.data);
      loadingState.innerHTML = `
        <h1>Something went wrong</h1>
        <p style="color: #c00;">${data.message}</p>
        <p><a href="/">Return to homepage</a></p>
      `;
    }
    eventSource.close();
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      if (blockCount === 0) {
        statusEl.textContent = 'Connection failed. Please try again.';
      }
    }
  };
}

/**
 * Render a fast generative page from ?fast= parameter
 * Uses the two-phase worker (vitamix-generative-fast)
 */
async function renderFastGenerativePage() {
  // Load skeleton styles
  await loadCSS(`${window.hlx.codeBasePath}/styles/skeleton.css`);

  const main = document.querySelector('main');
  if (!main) return;

  const params = new URLSearchParams(window.location.search);
  const query = params.get('fast');
  const images = params.get('images'); // 'fal' for fast, null/undefined for LoRA (default)
  const slug = generateSlug(query);

  // Clear main and show loading state with fast branding
  main.innerHTML = `
    <div class="section generating-container fast-mode">
      <div class="fast-badge">Fast Mode</div>
      <h1 class="generating-title">Creating Your Page</h1>
      <p class="generating-query">"${query}"</p>
      <div class="progress-indicator">
        <div class="progress-dot"></div>
        <div class="progress-dot"></div>
        <div class="progress-dot"></div>
      </div>
      <p class="generation-status">Hero appears in ~3 seconds...</p>
    </div>
    <div id="generation-content"></div>
  `;

  const loadingState = main.querySelector('.generating-container');
  const statusEl = main.querySelector('.generation-status');
  const content = main.querySelector('#generation-content');

  // Connect to FAST worker SSE stream (include images param if specified)
  const imageParam = images ? `&images=${encodeURIComponent(images)}` : '';
  const streamUrl = `${FAST_WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}${imageParam}`;
  const eventSource = new EventSource(streamUrl);
  let blockCount = 0;
  const generatedBlocks = []; // Array of { html, sectionStyle }
  const startTime = Date.now();

  eventSource.onopen = () => {
    statusEl.textContent = 'Connected, generating hero...';
  };

  eventSource.addEventListener('layout', (e) => {
    const data = JSON.parse(e.data);
    statusEl.textContent = `Layout ready: ${data.blocks.length} sections`;
  });

  eventSource.addEventListener('block-start', (e) => {
    const data = JSON.parse(e.data);
    if (data.position === 0) {
      statusEl.textContent = 'Hero incoming...';
    } else {
      statusEl.textContent = `Creating ${data.blockType}...`;
    }
  });

  eventSource.addEventListener('block-content', async (e) => {
    const data = JSON.parse(e.data);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

    // Hide loading state after first block (hero)
    if (blockCount === 0) {
      loadingState.style.display = 'none';
      // eslint-disable-next-line no-console
      console.log(`[Fast] Hero appeared in ${elapsedSec}s`);
    }
    blockCount += 1;

    // Store HTML and sectionStyle for persistence
    generatedBlocks.push({ html: data.html, sectionStyle: data.sectionStyle });

    // Create section and add content
    const section = document.createElement('div');
    section.className = 'section';
    if (data.sectionStyle && data.sectionStyle !== 'default') {
      section.classList.add(data.sectionStyle);
    }
    section.dataset.sectionStatus = 'initialized';
    section.innerHTML = data.html;

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

    // Decorate buttons and icons
    decorateButtons(section);
    decorateIcons(section);

    // Append to DOM
    content.appendChild(section);

    // Load the block (CSS + JS module)
    const block = section.querySelector('.block');
    if (block) {
      await loadBlock(block);
    }

    // Mark section as loaded
    section.dataset.sectionStatus = 'loaded';
    section.style.display = null;
  });

  // Handle image-ready events
  eventSource.addEventListener('image-ready', (e) => {
    const data = JSON.parse(e.data);
    const { imageId, url } = data;

    let resolvedUrl = url;
    if (url && url.startsWith('/')) {
      resolvedUrl = `${FAST_WORKER_URL}${url}`;
    }

    const img = content.querySelector(`img[data-gen-image="${imageId}"]`);
    if (img && resolvedUrl) {
      const originalUrl = img.dataset.originalSrc;
      img.src = resolvedUrl;

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
      img.classList.add('loaded');
    }
  });

  eventSource.addEventListener('generation-complete', (e) => {
    eventSource.close();
    const data = JSON.parse(e.data);
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // eslint-disable-next-line no-console
    console.log(`[Fast] Complete in ${totalTime}s`, data);

    // Update document title
    const h1 = content.querySelector('h1');
    if (h1) {
      document.title = `${h1.textContent} | Vitamix`;
    }

    // Add save section (reuse same pattern as standard flow)
    const saveSection = document.createElement('div');
    saveSection.className = 'section save-page-section';
    saveSection.innerHTML = `
      <div class="save-page-container">
        <div class="fast-complete-badge">Generated in ${totalTime}s</div>
        <h3>Like this page?</h3>
        <p>Save it to get a permanent link you can share and revisit.</p>
        <button class="button save-page-btn" data-slug="${slug}" data-query="${encodeURIComponent(query)}">
          Save & Get Permanent Link
        </button>
        <div class="save-status"></div>
      </div>
    `;
    content.appendChild(saveSection);

    // Handle save button click (uses fast worker's persist endpoint)
    const saveBtn = saveSection.querySelector('.save-page-btn');
    const saveStatus = saveSection.querySelector('.save-status');

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      saveStatus.textContent = '';

      try {
        const htmlForPersistence = generatedBlocks.map((block) => {
          let sectionHtml = block.html;
          if (block.sectionStyle && block.sectionStyle !== 'default') {
            sectionHtml += `
<div class="section-metadata">
  <div>
    <div>style</div>
    <div>${block.sectionStyle}</div>
  </div>
</div>`;
          }
          return sectionHtml;
        });

        const response = await fetch(`${FAST_WORKER_URL}/api/persist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            query,
            html: htmlForPersistence,
          }),
        });

        const result = await response.json();

        if (result.success) {
          const permanentUrl = `${window.location.origin}/discover/${slug}`;
          saveSection.innerHTML = `
            <div class="save-page-container save-success">
              <h3>Page Saved!</h3>
              <p>Your permanent link:</p>
              <a href="/discover/${slug}" class="permanent-link">${permanentUrl}</a>
              <button class="button copy-link-btn" onclick="navigator.clipboard.writeText('${permanentUrl}'); this.textContent='Copied!'">
                Copy Link
              </button>
            </div>
          `;
        } else {
          throw new Error(result.error || 'Failed to save');
        }
      } catch (error) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save & Get Permanent Link';
        saveStatus.textContent = `Error: ${error.message}. Please try again.`;
        saveStatus.style.color = '#c00';
      }
    });
  });

  eventSource.addEventListener('error', (e) => {
    if (e.data) {
      const data = JSON.parse(e.data);
      loadingState.innerHTML = `
        <h1>Something went wrong</h1>
        <p style="color: #c00;">${data.message}</p>
        <p><a href="/">Return to homepage</a></p>
      `;
    }
    eventSource.close();
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      if (blockCount === 0) {
        statusEl.textContent = 'Connection failed. Please try again.';
      }
    }
  };
}

/**
 * Builds hero block from default content pattern (picture + h1 without block wrapper).
 * This is the standard EDS auto-blocking behavior for pages where hero is not explicitly authored.
 * If a .hero block already exists, this function does nothing.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  // Skip if there's already an explicit hero block
  if (main.querySelector('.hero')) {
    return;
  }

  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');

  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto block `*/fragments/*` references
    const fragments = main.querySelectorAll('a[href*="/fragments/"]');
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(frag.firstElementChild);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }

    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  // Check if this is a Cerebras request (?cerebras=query) - handled by cerebras-scripts.js
  if (isCerebrasRequest()) {
    // cerebras-scripts.js handles this, just load header/footer
    document.documentElement.lang = 'en';
    decorateTemplateAndTheme();
    document.body.classList.add('appear');
    loadHeader(document.querySelector('header'));
    loadFooter(document.querySelector('footer'));
    return;
  }

  // Check if this is an experiment request (?experiment=query) - progressive rendering
  if (isExperimentRequest()) {
    const handled = await initExperiment();
    if (handled) return;
  }

  // Check if this is a fast request (?fast=query) - two-phase generation
  if (isFastRequest()) {
    document.documentElement.lang = 'en';
    decorateTemplateAndTheme();
    document.body.classList.add('appear', 'fast-mode');
    loadHeader(document.querySelector('header'));
    loadFooter(document.querySelector('footer'));
    await renderFastGenerativePage();
    return;
  }

  // Check if this is a generation request (?generate=query) - current flow
  if (isGenerationRequest()) {
    document.documentElement.lang = 'en';
    decorateTemplateAndTheme();
    document.body.classList.add('appear');
    loadHeader(document.querySelector('header'));
    loadFooter(document.querySelector('footer'));
    await renderGenerativePage();
    return;
  }

  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
