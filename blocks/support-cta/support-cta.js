/**
 * Support CTA Block
 *
 * Dual CTA for escalation - contact support AND order parts/resources.
 * Two-column action buttons layout.
 *
 * Content Model (DA Table):
 * | Support CTA                   |                              |
 * |-------------------------------|------------------------------|
 * | Contact Support               | Order Parts                  |
 * | Still need help? We're here.  | Replacement blades & more    |
 * | /support/contact              | /shop/parts                  |
 * | primary                       | secondary                    |
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length < 3) return;

  // Parse two CTAs from columns
  const ctaTitles = [...(rows[0]?.children || [])].map((c) => c.textContent.trim());
  const ctaDescriptions = [...(rows[1]?.children || [])].map((c) => c.textContent.trim());
  const ctaUrls = [...(rows[2]?.children || [])].map((c) => c.textContent.trim());
  const ctaStyles = [...(rows[3]?.children || [])].map((c) => c.textContent.trim().toLowerCase());

  const ctas = ctaTitles.map((title, index) => ({
    title,
    description: ctaDescriptions[index] || '',
    url: ctaUrls[index] || '#',
    style: ctaStyles[index] || (index === 0 ? 'primary' : 'secondary'),
  })).filter((cta) => cta.title);

  // Build CTA grid
  const grid = document.createElement('div');
  grid.className = 'support-cta-grid';

  ctas.forEach((cta) => {
    const card = document.createElement('a');
    card.className = `support-cta-card support-cta-${cta.style}`;
    card.href = cta.url;

    // Icon based on CTA type
    const icon = document.createElement('div');
    icon.className = 'support-cta-icon';

    if (cta.style === 'primary' || cta.title.toLowerCase().includes('contact')) {
      // Phone/support icon
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
      `;
    } else {
      // Wrench/parts icon
      icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      `;
    }
    card.appendChild(icon);

    // Title
    const title = document.createElement('h3');
    title.className = 'support-cta-title';
    title.textContent = cta.title;
    card.appendChild(title);

    // Description
    if (cta.description) {
      const desc = document.createElement('p');
      desc.className = 'support-cta-description';
      desc.textContent = cta.description;
      card.appendChild(desc);
    }

    // Arrow indicator
    const arrow = document.createElement('span');
    arrow.className = 'support-cta-arrow';
    arrow.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    `;
    card.appendChild(arrow);

    grid.appendChild(card);
  });

  // Clear and append
  block.textContent = '';
  block.appendChild(grid);
}
