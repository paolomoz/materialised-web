/**
 * Category Cards Block
 *
 * Displays product or content categories with images.
 * Aligned with vitamix.com category navigation patterns.
 *
 * == DA/EDS Table Structure ==
 *
 * | Category Cards            |                    |                    |                    |
 * |---------------------------|--------------------|--------------------|--------------------|
 * | [blenders.jpg]            | [containers.jpg]   | [immersion.jpg]    | [processing.jpg]   |
 * | **Blenders**              | **Containers**     | **Immersion**      | **Food Processing**|
 * | /shop/blenders            | /shop/containers   | /shop/immersion    | /shop/processing   |
 *
 * Alternative single-column authoring:
 * | Category Cards            |
 * |---------------------------|
 * | [blenders.jpg]            |
 * | **Blenders**              |
 * | /shop/blenders            |
 * |---------------------------|
 * | [containers.jpg]          |
 * | **Containers**            |
 * | /shop/containers          |
 *
 * Variants:
 * - bordered: adds border around cards
 * - large: larger images and text
 */

export default function decorate(block) {
  const ul = document.createElement('ul');
  const rows = [...block.children];

  // Check if this is multi-column (all content in one row) or multi-row format
  const firstRow = rows[0];
  const isMultiColumn = firstRow && [...firstRow.children].length > 1;

  if (isMultiColumn) {
    // Multi-column format: each column is a category
    const cells = [...firstRow.children];
    cells.forEach((cell) => {
      const li = createCategoryCard(cell);
      if (li) ul.appendChild(li);
    });
  } else {
    // Multi-row format: each row is a category
    rows.forEach((row) => {
      const cell = row.firstElementChild;
      if (cell) {
        const li = createCategoryCard(cell);
        if (li) ul.appendChild(li);
      }
    });
  }

  block.textContent = '';
  block.appendChild(ul);
}

/**
 * Creates a category card element from a cell's content
 * @param {Element} cell - The cell containing category content
 * @returns {Element|null} - The category card li element
 */
function createCategoryCard(cell) {
  const li = document.createElement('li');
  li.className = 'category-card';

  // Find image
  const pic = cell.querySelector('picture');

  // Find title (bold text or heading)
  const strong = cell.querySelector('strong');
  const heading = cell.querySelector('h1, h2, h3, h4, h5, h6');
  const titleText = strong?.textContent || heading?.textContent || '';

  // Find link (last link or link wrapping content)
  const links = [...cell.querySelectorAll('a')];
  const categoryLink = links.find((a) => a.href && !a.querySelector('picture')) || links[links.length - 1];
  const href = categoryLink?.href || '#';

  // Create card structure
  const link = document.createElement('a');
  link.href = href;
  link.className = 'category-card-link';

  // Image wrapper
  const imageDiv = document.createElement('div');
  imageDiv.className = 'category-card-image';
  if (pic) {
    imageDiv.appendChild(pic.cloneNode(true));
  }
  link.appendChild(imageDiv);

  // Title
  if (titleText) {
    const title = document.createElement('span');
    title.className = 'category-card-title';
    title.textContent = titleText;
    link.appendChild(title);
  }

  li.appendChild(link);
  return li;
}
