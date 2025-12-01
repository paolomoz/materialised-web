/**
 * Query Form Cerebras Block
 *
 * A form for submitting queries using the Cerebras worker.
 * Uses the same flow as the homepage: stays on page while generating,
 * then navigates when content is ready.
 */

// Cerebras worker URL
const CEREBRAS_WORKER_URL = 'https://vitamix-generative-cerebras.paolo-moz.workers.dev';
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
    // eslint-disable-next-line no-bitwise
    hash = ((hash << 5) - hash) + char;
    // eslint-disable-next-line no-bitwise
    hash &= hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Start generation and navigate when ready
 */
function startGeneration(block, query) {
  const slug = generateSlug(query);
  const startTime = Date.now();
  const generatedBlocks = [];
  let expectedBlockCount = 0;
  let hasNavigated = false;

  // Get image quality setting from header toggle (default to fast)
  const headerToggle = document.querySelector('.nav-quality-toggle .quality-option.active');
  const imageQuality = headerToggle ? headerToggle.dataset.value : 'fast';
  const imageProvider = imageQuality === 'best' ? 'imagen' : 'fal';

  // Get UI elements
  const submitBtn = block.querySelector('button[type="submit"]');
  const input = block.querySelector('input[type="text"]');
  const suggestionChips = block.querySelectorAll('.query-form-cerebras-examples button');

  // Store original button content
  const originalBtnHTML = submitBtn ? submitBtn.innerHTML : '';

  // Show loading state
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
  suggestionChips.forEach((chip) => {
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

      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        blocks: generatedBlocks,
        query,
        slug,
        startTime,
        expectedBlocks: expectedBlockCount,
        imageProvider,
      }));

      window.location.href = `/?cerebras=${encodeURIComponent(query)}&cached=1`;
    }
  }

  // Connect to SSE stream
  const streamUrl = `${CEREBRAS_WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}&images=${imageProvider}`;
  const eventSource = new EventSource(streamUrl);

  // eslint-disable-next-line no-console
  console.log(`[Cerebras Block] Starting generation with ${imageProvider} images`);

  eventSource.addEventListener('layout', (e) => {
    const data = JSON.parse(e.data);
    expectedBlockCount = data.blocks.length;
  });

  eventSource.addEventListener('block-content', (e) => {
    const data = JSON.parse(e.data);
    generatedBlocks.push({ html: data.html, sectionStyle: data.sectionStyle });

    // Update button text
    const updateText = `Creating... (${generatedBlocks.length}/${expectedBlockCount || '?'})`;
    if (submitBtn) {
      const span = submitBtn.querySelector('span');
      if (span) span.textContent = updateText;
    }

    navigateWhenReady();
  });

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

  // Restore buttons on error
  const restoreButtons = () => {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHTML;
    }
    if (input) {
      input.disabled = false;
    }
    suggestionChips.forEach((chip) => {
      chip.disabled = false;
      chip.style.pointerEvents = '';
      chip.style.opacity = '';
    });
  };

  eventSource.addEventListener('error', (e) => {
    eventSource.close();
    restoreButtons();
    if (e.data) {
      const data = JSON.parse(e.data);
      // eslint-disable-next-line no-alert
      alert(`Generation failed: ${data.message}`);
    }
  });

  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED && generatedBlocks.length === 0) {
      restoreButtons();
    }
  };
}

/**
 * Decorate the query-form-cerebras block
 */
export default function decorate(block) {
  // Get configuration from block content
  const rows = [...block.children];
  let placeholder = 'What would you like to explore?';
  let buttonText = 'Explore';
  let examples = [];

  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length >= 2) {
      const label = cells[0].textContent.trim().toLowerCase();
      const value = cells[1].textContent.trim();

      switch (label) {
        case 'placeholder':
          placeholder = value;
          break;
        case 'button':
          buttonText = value;
          break;
        case 'examples':
          examples = value.split(',').map((e) => e.trim()).filter(Boolean);
          break;
        default:
          break;
      }
    }
  });

  // Clear block and rebuild
  block.innerHTML = '';

  // Create form
  const form = document.createElement('form');
  form.className = 'query-form-cerebras-container';

  form.innerHTML = `
    <div class="query-form-cerebras-input-wrapper">
      <input
        type="text"
        name="query"
        placeholder="${placeholder}"
        autocomplete="off"
        required
      />
      <button type="submit" class="button primary">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
          <path d="M20 3v4"></path>
          <path d="M22 5h-4"></path>
          <path d="M4 17v2"></path>
          <path d="M5 18H3"></path>
        </svg>
        <span>${buttonText}</span>
      </button>
    </div>
    <div class="query-form-cerebras-error" style="display: none;"></div>
  `;

  // Add examples if provided
  if (examples.length > 0) {
    const examplesDiv = document.createElement('div');
    examplesDiv.className = 'query-form-cerebras-examples';
    examplesDiv.innerHTML = `
      <span class="examples-label">Or try:</span>
      ${examples.map((ex) => `<button type="button" data-query="${ex}">${ex}</button>`).join('')}
    `;
    form.appendChild(examplesDiv);
  }

  block.appendChild(form);

  // Set up event listeners
  const input = form.querySelector('input[type="text"]');

  // Form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query) {
      input.focus();
      return;
    }
    startGeneration(block, query);
  });

  // Example buttons
  const exampleBtns = block.querySelectorAll('.query-form-cerebras-examples button');
  exampleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const query = btn.dataset.query || btn.textContent;
      startGeneration(block, query);
    });
  });
}
