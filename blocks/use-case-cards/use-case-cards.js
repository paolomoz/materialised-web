/**
 * Use Case Cards Block
 *
 * Recommendation cards showing "Best for..." personas with products.
 *
 * Content Model (DA Table):
 * | Use Case Cards |
 * |----------------|
 * | **POWER USER** | A3500 | Best for tech-savvy cooks... | [Shop A3500](/products/a3500) |
 * | **BEST VALUE** | E310  | Best for budget buyers...    | [Shop E310](/products/e310)   |
 */
export default function decorate(block) {
  const rows = [...block.children];
  const cards = document.createElement('div');
  cards.className = 'use-case-cards-grid';

  rows.forEach((row) => {
    const content = row.querySelector(':scope > div');
    if (!content) return;

    const card = document.createElement('div');
    card.className = 'use-case-card';

    // Extract elements
    const persona = content.querySelector('p strong, strong');
    const heading = content.querySelector('h3');
    const paragraphs = content.querySelectorAll('p');
    const link = content.querySelector('a');

    // Badge (persona label)
    if (persona) {
      const badge = document.createElement('div');
      badge.className = 'use-case-badge';
      badge.textContent = persona.textContent;
      card.appendChild(badge);
    }

    // Product name
    if (heading) {
      const productName = document.createElement('h3');
      productName.className = 'use-case-product';
      productName.textContent = heading.textContent;
      card.appendChild(productName);
    }

    // Description - find paragraph that's not the persona or link
    paragraphs.forEach((p) => {
      const hasStrong = p.querySelector('strong');
      const hasLink = p.querySelector('a');
      if (!hasStrong && !hasLink) {
        const desc = document.createElement('p');
        desc.className = 'use-case-description';
        desc.textContent = p.textContent;
        card.appendChild(desc);
      }
    });

    // CTA link
    if (link) {
      const cta = document.createElement('a');
      cta.className = 'use-case-cta';
      cta.href = link.href;
      cta.textContent = link.textContent;
      card.appendChild(cta);
    }

    cards.appendChild(card);
  });

  block.textContent = '';
  block.appendChild(cards);
}
