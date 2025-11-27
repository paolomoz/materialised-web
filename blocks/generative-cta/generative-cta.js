/**
 * Generative CTA Block
 *
 * A call-to-action block that links to generatable pages.
 * When clicked, it shows a loading state and navigates to the
 * target page which will be generated on demand.
 */

/**
 * Check if a page exists (HEAD request)
 * @param {string} url - The URL to check
 * @returns {Promise<boolean>} - Whether the page exists
 */
async function pageExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Handle click on generative link
 * @param {Event} event - Click event
 * @param {HTMLAnchorElement} link - The link element
 */
async function handleGenerativeClick(event, link) {
  // Don't interfere with modified clicks
  if (event.metaKey || event.ctrlKey || event.shiftKey) {
    return;
  }

  const href = link.getAttribute('href');

  // Only handle /discover/ links
  if (!href.startsWith('/discover/')) {
    return;
  }

  // Check if already in generating state
  if (link.classList.contains('generating')) {
    event.preventDefault();
    return;
  }

  // Check if page already exists
  const exists = await pageExists(href);

  if (exists) {
    // Page exists, let normal navigation happen
    return;
  }

  // Page doesn't exist - show generating state
  event.preventDefault();

  link.classList.add('generating');
  const originalContent = link.innerHTML;
  link.innerHTML = `
    <span class="generating-text">Generating page...</span>
    <span class="generating-spinner"></span>
  `;

  // Get the generation hint
  const hint = link.dataset.generationHint || href.replace('/discover/', '').replace(/-/g, ' ');

  // Store hint for destination page
  const slug = href.replace('/discover/', '');
  try {
    sessionStorage.setItem(`query-${slug}`, hint);
  } catch {
    // Session storage might not be available
  }

  // Navigate with query parameter
  window.location.href = `${href}?q=${encodeURIComponent(hint)}`;
}

/**
 * Decorate the generative-cta block
 * @param {HTMLElement} block - The block element
 */
export default function decorate(block) {
  // Find all links in the block
  const links = block.querySelectorAll('a');

  links.forEach((link) => {
    const href = link.getAttribute('href');

    // Check if this is a generative link
    if (href && href.startsWith('/discover/')) {
      link.classList.add('generative-link');

      // Extract hint from metadata if available
      const metaDiv = link.closest('div')?.querySelector('[class*="metadata"]');
      if (metaDiv) {
        try {
          const meta = JSON.parse(metaDiv.textContent);
          if (meta.hint) {
            link.dataset.generationHint = meta.hint;
          }
          metaDiv.remove(); // Hide metadata
        } catch {
          // Not JSON metadata
        }
      }

      // Add click handler
      link.addEventListener('click', (event) => handleGenerativeClick(event, link));
    }
  });

  // Style the block
  const rows = [...block.children];

  if (rows.length >= 1) {
    // First row is the main content
    rows[0].classList.add('generative-cta-content');
  }

  // Add wrapper class based on content
  const hasImage = block.querySelector('picture');
  if (hasImage) {
    block.classList.add('with-image');
  }
}
