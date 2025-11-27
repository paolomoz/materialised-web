/**
 * Query Form Block
 *
 * A form for submitting queries that generate personalized pages.
 * Handles query submission, slug generation, and navigation.
 */

/**
 * Generate a URL-safe slug from a query
 * @param {string} query - The user's query
 * @returns {string} - URL-safe slug
 */
function generateSlug(query) {
  // Create a readable slug from the query
  let slug = query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);

  // Add a short hash for uniqueness
  const hash = simpleHash(query + Date.now()).slice(0, 6);
  return `${slug}-${hash}`;
}

/**
 * Simple hash function
 * @param {string} str - String to hash
 * @returns {string} - Hash string
 */
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
 * Handle form submission
 * @param {Event} event - Submit event
 * @param {HTMLFormElement} form - The form element
 */
async function handleSubmit(event, form) {
  event.preventDefault();

  const input = form.querySelector('input[type="text"]');
  const submitButton = form.querySelector('button[type="submit"]');
  const query = input.value.trim();

  if (!query) {
    input.focus();
    return;
  }

  // Show loading state
  submitButton.disabled = true;
  submitButton.classList.add('loading');
  const originalText = submitButton.textContent;
  submitButton.textContent = 'Generating...';

  try {
    // Generate slug and navigate
    const slug = generateSlug(query);
    const url = `/discover/${slug}?q=${encodeURIComponent(query)}`;

    // Store query in session for the destination page
    try {
      sessionStorage.setItem(`query-${slug}`, query);
    } catch (e) {
      // Session storage might not be available
    }

    // Navigate to the generated page
    window.location.href = url;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Generation failed:', error);

    // Reset button state
    submitButton.disabled = false;
    submitButton.classList.remove('loading');
    submitButton.textContent = originalText;

    // Show error
    const errorDiv = form.querySelector('.query-form-error');
    if (errorDiv) {
      errorDiv.textContent = 'Something went wrong. Please try again.';
      errorDiv.style.display = 'block';
    }
  }
}

/**
 * Set up example query buttons
 * @param {HTMLElement} block - The block element
 * @param {HTMLInputElement} input - The input element
 */
function setupExamples(block, input) {
  const examples = block.querySelectorAll('.query-form-examples button');
  examples.forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.textContent;
      input.focus();
    });
  });
}

/**
 * Decorate the query-form block
 * @param {HTMLElement} block - The block element
 */
export default function decorate(block) {
  // Get configuration from block content
  const rows = [...block.children];
  let placeholder = 'What would you like to discover?';
  let buttonText = 'Generate';
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
  form.className = 'query-form-container';
  form.innerHTML = `
    <div class="query-form-input-wrapper">
      <input
        type="text"
        name="query"
        placeholder="${placeholder}"
        autocomplete="off"
        required
      />
      <button type="submit" class="button primary">
        ${buttonText}
      </button>
    </div>
    <div class="query-form-error" style="display: none;"></div>
  `;

  // Add examples if provided
  if (examples.length > 0) {
    const examplesDiv = document.createElement('div');
    examplesDiv.className = 'query-form-examples';
    examplesDiv.innerHTML = `
      <span class="examples-label">Try:</span>
      ${examples.map((ex) => `<button type="button">${ex}</button>`).join('')}
    `;
    form.appendChild(examplesDiv);
  }

  block.appendChild(form);

  // Set up event listeners
  const input = form.querySelector('input[type="text"]');

  form.addEventListener('submit', (event) => handleSubmit(event, form));
  setupExamples(block, input);

  // Focus input on page load if this is the main CTA
  if (block.closest('.section')?.classList.contains('hero')) {
    setTimeout(() => input.focus(), 100);
  }
}
