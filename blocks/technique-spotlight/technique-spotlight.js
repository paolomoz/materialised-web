/**
 * Technique Spotlight Block
 *
 * 50/50 split layout showcasing a blending technique with media and tips.
 * Supports image media only.
 *
 * Content Model (DA Table):
 * | Technique Spotlight                                           |
 * |---------------------------------------------------------------|
 * | [technique-image.jpg]                                         |
 * | **Layering Technique**                                        |
 * | Master the art of layering ingredients for perfect blends.    |
 * | Liquid first • Soft ingredients • Frozen on top              |
 * | Start slow, increase speed                                    |
 * | Blend for 60 seconds                                          |
 * | /learn/layering-technique                                     |
 */

export default function decorate(block) {
  const rows = [...block.children];
  let mediaHtml = '';
  let title = '';
  let description = '';
  const tips = [];
  let link = '';

  // Store original img element for progressive image loading
  let originalImg = null;

  rows.forEach((row) => {
    const cell = row.children[0];
    if (!cell) return;

    const picture = cell.querySelector('picture');
    const strong = cell.querySelector('strong');
    const anchor = cell.querySelector('a');
    const text = cell.textContent.trim();

    if (picture) {
      // Store original img element to preserve data-gen-image attribute
      originalImg = picture.querySelector('img');
      mediaHtml = 'HAS_IMAGE'; // Placeholder, will use original element
    } else if (strong && !title) {
      title = strong.textContent;
    } else if (!description && text.length > 50 && !text.includes('•')) {
      description = text;
    } else if (text.includes('•')) {
      // Tip with bullet points
      tips.push(...text.split('•').map((t) => t.trim()).filter(Boolean));
    } else if (anchor && !link) {
      link = anchor.href;
    } else if (text.startsWith('/')) {
      link = text;
    } else if (text && !text.includes('•') && text.length < 60) {
      // Short text = tip
      tips.push(text);
    }
  });

  // Build HTML structure
  block.innerHTML = `
    <div class="technique-spotlight-inner">
      <div class="spotlight-media">
        ${mediaHtml ? '<picture class="spotlight-image"></picture>' : '<div class="spotlight-placeholder"></div>'}
      </div>
      <div class="spotlight-content">
        <div class="spotlight-header">
          <span class="spotlight-label">Pro Technique</span>
          <h2 class="spotlight-title">${title || 'Blending Technique'}</h2>
          <p class="spotlight-description">${description || 'Master this technique for perfect results every time.'}</p>
        </div>
        <div class="spotlight-tips">
          <h3 class="tips-title">Key Tips</h3>
          <ul class="tips-list">
            ${tips.map((tip, i) => `
              <li class="tip-item">
                <span class="tip-number">${i + 1}</span>
                <span class="tip-text">${tip}</span>
              </li>
            `).join('')}
          </ul>
        </div>
        ${link ? `
          <a href="${link}" class="spotlight-cta">
            Learn More
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </a>
        ` : ''}
      </div>
    </div>
  `;

  // Insert original img element to preserve data-gen-image for progressive loading
  if (originalImg) {
    const pictureEl = block.querySelector('.spotlight-image');
    if (pictureEl) {
      pictureEl.appendChild(originalImg);
    }
  }

  // Animate tips on scroll
  const tipItems = block.querySelectorAll('.tip-item');
  if (tipItems.length > 0) {
    const tipObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.2, rootMargin: '0px 0px -50px 0px' },
    );

    tipItems.forEach((item) => tipObserver.observe(item));
  }
}
