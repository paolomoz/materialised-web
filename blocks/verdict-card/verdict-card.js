/**
 * Verdict Card Block
 *
 * Summary recommendation card with overall verdict and per-product guidance.
 *
 * Content Model (DA Table):
 * | Verdict Card |
 * |--------------|
 * | ## The Verdict |
 * | For most people, we recommend the **A2500**... |
 * | - **Choose A3500 if:** You want touchscreen... |
 * | - **Choose A2500 if:** You want great value... |
 */
export default function decorate(block) {
  const content = block.querySelector(':scope > div > div');
  if (!content) return;

  // Create verdict structure
  const verdict = document.createElement('div');
  verdict.className = 'verdict-card-inner';

  // Trophy icon
  const icon = document.createElement('div');
  icon.className = 'verdict-card-icon';
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8m-4-4v4m-5-8a5 5 0 0 1-5-5V4h4m10 4v4a5 5 0 0 1-5 5m5-9V4h-4m-6 0v4a5 5 0 0 0 5 5 5 5 0 0 0 5-5V4H6z"/></svg>';

  // Content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'verdict-card-content';

  // Move all content
  while (content.firstChild) {
    contentWrapper.appendChild(content.firstChild);
  }

  // Style the heading
  const heading = contentWrapper.querySelector('h2');
  if (heading) {
    heading.className = 'verdict-card-title';
  }

  // Style the list items
  const list = contentWrapper.querySelector('ul');
  if (list) {
    list.className = 'verdict-card-recommendations';
  }

  verdict.appendChild(icon);
  verdict.appendChild(contentWrapper);

  block.textContent = '';
  block.appendChild(verdict);
}
