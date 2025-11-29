/**
 * Tips Banner Block
 *
 * Displays a grid of tips with numbers, headlines, and descriptions.
 * Used for quick tips, pro tips, or numbered guidance.
 *
 * Content Model (DA Table):
 * | Tips Banner                 |                    |                    |
 * |-----------------------------|--------------------|--------------------|
 * | **Prep Ingredients**        | **Use Frozen Fruit**| **Start Slow**    |
 * | Cut fruits into chunks...   | Frozen adds chill..| Begin on low...   |
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length === 0) return;

  // Check for section title
  const firstRow = rows[0];
  let startIndex = 0;
  let header = null;

  if (firstRow && firstRow.children.length === 1) {
    const h2 = firstRow.querySelector('h2');
    if (h2) {
      header = document.createElement('div');
      header.className = 'tips-banner-header';
      header.appendChild(h2.cloneNode(true));
      startIndex = 1;
    }
  }

  // Collect tips from table cells
  const tips = [];
  rows.slice(startIndex).forEach((row) => {
    const cells = [...row.children];
    cells.forEach((cell, idx) => {
      if (!tips[idx]) {
        tips[idx] = { headline: '', description: '' };
      }

      const strong = cell.querySelector('strong');
      const text = cell.textContent.trim();

      if (strong) {
        tips[idx].headline = strong.textContent;
        // Get remaining text as description
        const desc = text.replace(strong.textContent, '').trim();
        if (desc) {
          tips[idx].description = desc;
        }
      } else if (text && !tips[idx].description) {
        tips[idx].description = text;
      }
    });
  });

  // Build the tips grid
  const grid = document.createElement('div');
  grid.className = 'tips-banner-grid';

  tips.forEach((tip, idx) => {
    if (!tip.headline) return;

    const item = document.createElement('div');
    item.className = 'tips-banner-item';

    // Number badge
    const number = document.createElement('div');
    number.className = 'tips-banner-number';
    number.textContent = idx + 1;
    item.appendChild(number);

    // Content
    const content = document.createElement('div');
    content.className = 'tips-banner-content';

    const headline = document.createElement('h3');
    headline.className = 'tips-banner-headline';
    headline.textContent = tip.headline;
    content.appendChild(headline);

    if (tip.description) {
      const desc = document.createElement('p');
      desc.className = 'tips-banner-description';
      desc.textContent = tip.description;
      content.appendChild(desc);
    }

    item.appendChild(content);
    grid.appendChild(item);
  });

  // Clear and rebuild
  block.textContent = '';
  if (header) {
    block.appendChild(header);
  }
  block.appendChild(grid);
}
