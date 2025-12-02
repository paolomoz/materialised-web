/**
 * Included Accessories Block
 *
 * Shows what's in the box with product images and descriptions.
 *
 * Content Model (DA Table):
 * | Included Accessories |
 * |----------------------|
 * | [container.jpg] | **64 oz Container** | Low-profile design fits under cabinets |
 * | [tamper.jpg] | **Tamper** | Process thick blends without stopping |
 * | [cookbook.jpg] | **Getting Started Guide** | Recipes to start your journey |
 * | [lid.jpg] | **Two-Part Lid** | Vented for hot ingredients |
 */
export default function decorate(block) {
  const rows = [...block.children];
  const wrapper = document.createElement('div');
  wrapper.className = 'included-accessories-wrapper';

  // Title
  const title = document.createElement('h2');
  title.className = 'included-accessories-title';
  title.textContent = 'What\'s Included';
  wrapper.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'included-accessories-grid';

  rows.forEach((row) => {
    const cells = [...row.children];
    const item = document.createElement('div');
    item.className = 'included-accessory-item';

    cells.forEach((cell) => {
      const picture = cell.querySelector('picture');
      const strong = cell.querySelector('strong');
      const paragraphs = cell.querySelectorAll('p');

      // Image
      if (picture) {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'included-accessory-image';
        imageDiv.appendChild(picture.cloneNode(true));
        item.appendChild(imageDiv);
      }

      // Name from strong tag
      if (strong) {
        const name = document.createElement('h3');
        name.className = 'included-accessory-name';
        name.textContent = strong.textContent;
        item.appendChild(name);
      }

      // Description (paragraph without strong tag or text after strong)
      paragraphs.forEach((p) => {
        const pStrong = p.querySelector('strong');
        if (!pStrong && p.textContent.trim()) {
          const desc = document.createElement('p');
          desc.className = 'included-accessory-description';
          desc.textContent = p.textContent;
          item.appendChild(desc);
        } else if (pStrong) {
          // Get text after the strong tag
          const fullText = p.textContent;
          const strongText = pStrong.textContent;
          const remainder = fullText.replace(strongText, '').trim();
          if (remainder) {
            const desc = document.createElement('p');
            desc.className = 'included-accessory-description';
            desc.textContent = remainder;
            item.appendChild(desc);
          }
        }
      });
    });

    if (item.children.length > 0) {
      grid.appendChild(item);
    }
  });

  wrapper.appendChild(grid);
  block.textContent = '';
  block.appendChild(wrapper);
}
