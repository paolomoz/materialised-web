/**
 * Recipe Cards Block
 *
 * Displays recipe cards with images, titles, and metadata (difficulty, time).
 * Based on Recipe Cards pattern from Vitamix design system.
 *
 * Content Model (DA Table):
 * | Recipe Cards                |                    |                    |
 * |-----------------------------|--------------------|--------------------|
 * | [smoothie.jpg]              | [soup.jpg]         | [sauce.jpg]        |
 * | **Green Smoothie**          | **Tomato Soup**    | **Pesto Sauce**    |
 * | Simple • 5 min              | Easy • 20 min      | Simple • 10 min    |
 * | /recipes/green-smoothie     | /recipes/soup      | /recipes/pesto     |
 */
export default function decorate(block) {
  const rows = [...block.children];
  const ul = document.createElement('ul');

  // Check if we have section title (first row might be a title)
  const firstRow = rows[0];
  let startIndex = 0;

  if (firstRow && firstRow.children.length === 1) {
    const h2 = firstRow.querySelector('h2');
    if (h2) {
      const header = document.createElement('div');
      header.className = 'recipe-cards-header';
      header.appendChild(h2.cloneNode(true));
      block.insertBefore(header, block.firstChild);
      startIndex = 1;
    }
  }

  // Process cards - each column in the table is a card
  const cardData = [];

  // Collect data from rows
  rows.slice(startIndex).forEach((row) => {
    const cells = [...row.children];
    cells.forEach((cell, idx) => {
      if (!cardData[idx]) {
        cardData[idx] = { image: null, title: '', meta: '', link: '' };
      }

      const picture = cell.querySelector('picture');
      const strong = cell.querySelector('strong');
      const link = cell.querySelector('a');
      const text = cell.textContent.trim();

      if (picture) {
        // Store the original img element (not picture) to preserve data-gen-image for progressive loading
        const img = picture.querySelector('img');
        cardData[idx].image = img || picture;
      } else if (strong) {
        cardData[idx].title = strong.textContent;
      } else if (link && !strong) {
        // Link without strong text - this is the URL
        cardData[idx].link = link.href;
      } else if (text && !strong && (text.includes('•') || text.includes('min'))) {
        // Metadata like "Simple • 5 min"
        cardData[idx].meta = text;
      } else if (text && text.startsWith('/')) {
        // URL path
        cardData[idx].link = text;
      }
    });
  });

  // Build card elements
  cardData.forEach((card) => {
    if (!card.title && !card.image) return;

    const li = document.createElement('li');
    li.className = 'recipe-card';

    const wrapper = card.link
      ? document.createElement('a')
      : document.createElement('div');
    if (card.link) {
      wrapper.href = card.link;
    }
    wrapper.className = 'recipe-card-inner';

    // Image - use original element (not clone) to preserve data-gen-image for progressive loading
    if (card.image) {
      const imageDiv = document.createElement('div');
      imageDiv.className = 'recipe-card-image';
      // Append original img element directly to preserve reference for image-ready updates
      imageDiv.appendChild(card.image);
      wrapper.appendChild(imageDiv);
    }

    // Body
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'recipe-card-body';

    // Title
    if (card.title) {
      const h3 = document.createElement('h3');
      h3.className = 'recipe-card-title';
      h3.textContent = card.title;
      bodyDiv.appendChild(h3);
    }

    // Meta (difficulty • time)
    if (card.meta) {
      const metaDiv = document.createElement('div');
      metaDiv.className = 'recipe-card-meta';

      // Parse meta like "Simple • 5 min"
      const parts = card.meta.split('•').map((p) => p.trim());
      parts.forEach((part) => {
        const span = document.createElement('span');
        if (part.includes('min') || part.includes('hour')) {
          span.className = 'recipe-time';
          span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>${part}`;
        } else {
          span.className = 'recipe-difficulty';
          span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>${part}`;
        }
        metaDiv.appendChild(span);
      });

      bodyDiv.appendChild(metaDiv);
    }

    wrapper.appendChild(bodyDiv);
    li.appendChild(wrapper);
    ul.appendChild(li);
  });

  // Clear and rebuild
  const header = block.querySelector('.recipe-cards-header');
  block.textContent = '';
  if (header) {
    block.appendChild(header);
  }
  block.appendChild(ul);
}
