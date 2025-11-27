import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
} from './aem.js';

// Generative worker URL
const GENERATIVE_WORKER_URL = 'https://vitamix-generative.paolo-moz.workers.dev';

/**
 * Check if this is a generative discover page
 */
function isDiscoverPage() {
  return window.location.pathname.startsWith('/discover/');
}

/**
 * Render a generative discover page
 */
async function renderDiscoverPage() {
  // Load skeleton styles
  await loadCSS(`${window.hlx.codeBasePath}/styles/skeleton.css`);

  const main = document.querySelector('main');
  if (!main) return;

  // Extract slug and query from URL
  const slug = window.location.pathname.replace('/discover/', '');
  const query = new URLSearchParams(window.location.search).get('q') || slug.replace(/-/g, ' ');

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

  // Connect to SSE stream
  const streamUrl = `${GENERATIVE_WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}`;
  const eventSource = new EventSource(streamUrl);
  let blockCount = 0;

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

  eventSource.addEventListener('block-content', (e) => {
    const data = JSON.parse(e.data);

    // Hide loading state after first block
    if (blockCount === 0) {
      loadingState.style.display = 'none';
    }
    blockCount += 1;

    // Create section and add content
    const section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = data.html;

    // Decorate the content using EDS patterns
    decorateButtons(section);
    decorateIcons(section);

    // Find and decorate blocks
    const block = section.querySelector('[class]');
    if (block) {
      const blockName = block.className.split(' ')[0];
      block.classList.add('block');
      block.dataset.blockName = blockName;
    }

    content.appendChild(section);
  });

  eventSource.addEventListener('generation-complete', () => {
    eventSource.close();
    // Update document title
    const h1 = content.querySelector('h1');
    if (h1) {
      document.title = `${h1.textContent} | Vitamix`;
    }
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
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
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
  // Check if this is a discover page - render generatively
  if (isDiscoverPage()) {
    document.documentElement.lang = 'en';
    decorateTemplateAndTheme();
    document.body.classList.add('appear');
    loadHeader(document.querySelector('header'));
    loadFooter(document.querySelector('footer'));
    await renderDiscoverPage();
    return;
  }

  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
