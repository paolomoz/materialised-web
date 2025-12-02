/**
 * Product CTA Block
 *
 * Final call-to-action for product detail page with buy button and secondary actions.
 *
 * Content Model (DA Table):
 * | Product CTA |
 * |-------------|
 * | ## Ready to Blend? | Start your Vitamix journey today. |
 * | [Buy Now](link) | [Find a Retailer](link) | [Compare Models](link) |
 */
export default function decorate(block) {
  const rows = [...block.children];
  const wrapper = document.createElement('div');
  wrapper.className = 'product-cta-wrapper';

  rows.forEach((row) => {
    const cells = [...row.children];

    cells.forEach((cell) => {
      const heading = cell.querySelector('h2, h3');
      const paragraphs = cell.querySelectorAll('p');
      const links = cell.querySelectorAll('a');

      // Heading
      if (heading) {
        const h2 = document.createElement('h2');
        h2.className = 'product-cta-title';
        h2.textContent = heading.textContent;
        wrapper.appendChild(h2);
      }

      // Description paragraph (not containing links)
      paragraphs.forEach((p) => {
        if (!p.querySelector('a') && p.textContent.trim()) {
          const desc = document.createElement('p');
          desc.className = 'product-cta-description';
          desc.textContent = p.textContent;
          wrapper.appendChild(desc);
        }
      });

      // CTA buttons
      if (links.length > 0) {
        let ctaGroup = wrapper.querySelector('.product-cta-buttons');
        if (!ctaGroup) {
          ctaGroup = document.createElement('div');
          ctaGroup.className = 'product-cta-buttons';
          wrapper.appendChild(ctaGroup);
        }

        links.forEach((link, index) => {
          const btn = document.createElement('a');
          btn.href = link.href;
          btn.textContent = link.textContent;
          btn.className = `product-cta-button ${index === 0 ? 'primary' : 'secondary'}`;
          ctaGroup.appendChild(btn);
        });
      }
    });
  });

  block.textContent = '';
  block.appendChild(wrapper);
}
