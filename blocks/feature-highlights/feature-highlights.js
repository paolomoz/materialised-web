/**
 * Feature Highlights Block
 *
 * Key features with images and descriptions.
 *
 * Content Model (DA Table):
 * | Feature Highlights |
 * |--------------------|
 * | [image.jpg] | ## Touchscreen Controls | Intuitive LED controls... |
 * | [image.jpg] | ## Self-Detect | Automatically adjusts... |
 * | [image.jpg] | ## 5 Programs | Smoothies, Hot Soups... |
 */
export default function decorate(block) {
  const rows = [...block.children];
  const grid = document.createElement('div');
  grid.className = 'feature-highlights-grid';

  rows.forEach((row) => {
    const cells = [...row.children];
    const card = document.createElement('div');
    card.className = 'feature-highlight-card';

    cells.forEach((cell) => {
      const picture = cell.querySelector('picture');
      const heading = cell.querySelector('h2, h3');
      const paragraphs = cell.querySelectorAll('p');

      // Image
      if (picture) {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'feature-highlight-image';
        imageDiv.appendChild(picture.cloneNode(true));
        card.appendChild(imageDiv);
      }

      // Content
      if (heading || paragraphs.length > 0) {
        const contentDiv = document.createElement('div');
        contentDiv.className = 'feature-highlight-content';

        if (heading) {
          const h3 = document.createElement('h3');
          h3.className = 'feature-highlight-title';
          h3.textContent = heading.textContent;
          contentDiv.appendChild(h3);
        }

        paragraphs.forEach((p) => {
          const desc = document.createElement('p');
          desc.className = 'feature-highlight-description';
          desc.textContent = p.textContent;
          contentDiv.appendChild(desc);
        });

        card.appendChild(contentDiv);
      }
    });

    if (card.children.length > 0) {
      grid.appendChild(card);
    }
  });

  block.textContent = '';
  block.appendChild(grid);
}
