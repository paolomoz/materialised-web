/**
 * Query Form Cerebras Block
 *
 * A form for submitting queries using the Cerebras worker.
 * Delegates to the global startCerebrasGeneration function from cerebras-scripts.js
 * which handles SSE streaming and page transformation.
 */

/**
 * Start generation - show loading UI and delegate to global handler
 */
function startGeneration(block, query) {
  // Get UI elements
  const submitBtn = block.querySelector('button[type="submit"]');
  const input = block.querySelector('input[type="text"]');
  const suggestionChips = block.querySelectorAll('.query-form-cerebras-examples button');

  // Show loading state on block elements
  if (submitBtn) {
    const btnWidth = submitBtn.offsetWidth;
    submitBtn.style.minWidth = `${btnWidth}px`;
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

  // eslint-disable-next-line no-console
  console.log(`[Cerebras Block] Starting generation via global handler`);

  // Delegate to global handler which will transform the page when first block arrives
  if (window.startCerebrasGeneration) {
    window.startCerebrasGeneration(query);
  } else {
    // eslint-disable-next-line no-console
    console.error('[Cerebras Block] Global startCerebrasGeneration not available');
    // Fallback: navigate directly
    window.location.href = `/?cerebras=${encodeURIComponent(query)}`;
  }
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
