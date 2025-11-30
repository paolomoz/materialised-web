/**
 * Support Hero Block
 *
 * Modern hero with background image for troubleshooting/support pages.
 * Features a badge, title, subtitle with dark overlay.
 *
 * Content Model (DA Table):
 * | Support Hero                                    |
 * |-------------------------------------------------|
 * | [background image]                              |
 * | Troubleshooting: Grinding Noise                 |
 * | Let's get your Vitamix back to peak performance |
 *
 * Or without image (will use gradient fallback):
 * | Support Hero                                    |
 * |-------------------------------------------------|
 * | Troubleshooting: Grinding Noise                 |
 * | Let's get your Vitamix back to peak performance |
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length === 0) return;

  // Extract content from rows
  let backgroundImage = null;
  let title = '';
  let subtitle = '';

  rows.forEach((row) => {
    const cell = row.querySelector('div') || row;
    const picture = cell.querySelector('picture');

    if (picture && !backgroundImage) {
      // This row contains the background image
      backgroundImage = picture.cloneNode(true);
    } else {
      // Text content
      const text = cell.textContent.trim();
      if (text) {
        if (!title) {
          title = text;
        } else if (!subtitle) {
          subtitle = text;
        }
      }
    }
  });

  // Build hero structure
  block.textContent = '';

  // Background image (if provided)
  if (backgroundImage) {
    const bgWrapper = document.createElement('div');
    bgWrapper.className = 'support-hero-background';
    bgWrapper.appendChild(backgroundImage);
    block.appendChild(bgWrapper);
  }

  // Content wrapper
  const content = document.createElement('div');
  content.className = 'support-hero-content';

  // Badge with wrench/tool icon for troubleshooting empathy
  const badge = document.createElement('div');
  badge.className = 'support-hero-badge';
  badge.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
    <span>Troubleshooting Guide</span>
  `;
  content.appendChild(badge);

  // Title
  if (title) {
    const h1 = document.createElement('h1');
    h1.className = 'support-hero-title';
    h1.textContent = title;
    content.appendChild(h1);
  }

  // Subtitle (empathetic message)
  if (subtitle) {
    const p = document.createElement('p');
    p.className = 'support-hero-subtitle';
    p.textContent = subtitle;
    content.appendChild(p);
  }

  block.appendChild(content);
}
