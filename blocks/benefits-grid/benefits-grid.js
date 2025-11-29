/**
 * Benefits Grid Block
 *
 * Displays benefit/feature items with icons, headlines, and descriptions.
 * Based on Feature Grid pattern from Vitamix design system.
 *
 * Content Model (DA Table):
 * | Benefits Grid               |                    |                    |
 * |-----------------------------|--------------------|--------------------|
 * | :icon-clock:                | :icon-heart:       | :icon-leaf:        |
 * | **Quick & Easy**            | **Heart Healthy**  | **Whole Foods**    |
 * | Ready in under 5 minutes    | Nutrient-rich...   | Use whole fruits...|
 */
export default function decorate(block) {
  const items = [...block.children];

  // Clear block and create grid container
  const grid = document.createElement('div');
  grid.className = 'benefits-grid-items';

  items.forEach((row) => {
    const cells = [...row.children];
    if (cells.length === 0) return;

    // Each cell is a benefit item
    cells.forEach((cell) => {
      const item = document.createElement('div');
      item.className = 'benefits-grid-item';

      // Extract content from cell
      const icon = cell.querySelector('.icon');
      const strong = cell.querySelector('strong');
      const paragraphs = cell.querySelectorAll('p');

      // Icon
      if (icon) {
        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'benefits-grid-icon';
        iconWrapper.appendChild(icon.cloneNode(true));
        item.appendChild(iconWrapper);
      }

      // Headline (from strong or first element with strong)
      if (strong) {
        const headline = document.createElement('h3');
        headline.className = 'benefits-grid-headline';
        headline.textContent = strong.textContent;
        item.appendChild(headline);
      }

      // Description (paragraphs without icons or strong)
      paragraphs.forEach((p) => {
        // Skip if this paragraph only contains an icon or strong
        if (p.querySelector('.icon') && p.childNodes.length === 1) return;
        if (p.querySelector('strong') && p.childNodes.length === 1) return;

        // Get text content excluding icon/strong
        const text = p.textContent.replace(strong?.textContent || '', '').trim();
        if (text) {
          const desc = document.createElement('p');
          desc.className = 'benefits-grid-description';
          desc.textContent = text;
          item.appendChild(desc);
        }
      });

      // If no structured content found, use raw text
      if (!item.querySelector('.benefits-grid-headline')) {
        const text = cell.textContent.trim();
        if (text) {
          const lines = text.split('\n').filter((l) => l.trim());
          if (lines.length > 0) {
            const headline = document.createElement('h3');
            headline.className = 'benefits-grid-headline';
            headline.textContent = lines[0];
            item.appendChild(headline);

            if (lines.length > 1) {
              const desc = document.createElement('p');
              desc.className = 'benefits-grid-description';
              desc.textContent = lines.slice(1).join(' ');
              item.appendChild(desc);
            }
          }
        }
      }

      grid.appendChild(item);
    });
  });

  block.textContent = '';
  block.appendChild(grid);
}
