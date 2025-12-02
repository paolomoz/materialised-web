/**
 * Recipe Hero Detail Block
 *
 * Displays an enhanced recipe hero with image, title, star rating,
 * description, metadata icons (time, yield, difficulty), dietary info,
 * and submitter attribution.
 *
 * Content Model (DA Table):
 * | Recipe Hero Detail |                |
 * |--------------------|----------------|
 * | [image]            | title          |
 * |                    | rating         |
 * |                    | description    |
 * |                    | time,yield,difficulty |
 * |                    | dietary,submittedBy |
 *
 * HTML structure after decoration:
 * <div class="recipe-hero-detail">
 *   <div class="recipe-hero-detail-image">...</div>
 *   <div class="recipe-hero-detail-content">
 *     <h1>Title</h1>
 *     <div class="rating">...</div>
 *     <p class="description">...</p>
 *     <div class="metadata">...</div>
 *     <div class="attribution">...</div>
 *   </div>
 * </div>
 */

// SVG icons for metadata
const ICONS = {
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  yield: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>`,
  difficulty: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  starEmpty: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
};

function createStarRating(rating, reviewCount) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  let starsHtml = '';
  for (let i = 0; i < fullStars; i += 1) {
    starsHtml += `<span class="star star-full">${ICONS.star}</span>`;
  }
  if (hasHalfStar) {
    starsHtml += `<span class="star star-half">${ICONS.star}</span>`;
  }
  for (let i = 0; i < emptyStars; i += 1) {
    starsHtml += `<span class="star star-empty">${ICONS.starEmpty}</span>`;
  }

  return `
    <div class="recipe-hero-detail-rating">
      <div class="stars">${starsHtml}</div>
      <span class="review-count">(${reviewCount})</span>
      <a href="#reviews" class="write-review">Write a review</a>
    </div>
  `;
}

function createMetadata(time, yieldText, difficulty) {
  return `
    <div class="recipe-hero-detail-metadata">
      <div class="meta-item">
        <span class="meta-icon">${ICONS.clock}</span>
        <div class="meta-text">
          <span class="meta-label">TOTAL TIME</span>
          <span class="meta-value">${time}</span>
        </div>
      </div>
      <div class="meta-item">
        <span class="meta-icon">${ICONS.yield}</span>
        <div class="meta-text">
          <span class="meta-label">YIELD</span>
          <span class="meta-value">${yieldText}</span>
        </div>
      </div>
      <div class="meta-item">
        <span class="meta-icon">${ICONS.difficulty}</span>
        <div class="meta-text">
          <span class="meta-label">DIFFICULTY</span>
          <span class="meta-value">${difficulty}</span>
        </div>
      </div>
    </div>
  `;
}

export default function decorate(block) {
  const rows = [...block.children];

  // Extract image from first row
  let imageCell = null;
  let contentCells = [];

  if (rows[0]) {
    const cells = [...rows[0].children];
    if (cells[0]) {
      const img = cells[0].querySelector('img, picture');
      if (img) {
        imageCell = cells[0];
      }
    }
    if (cells[1]) {
      contentCells.push(cells[1]);
    }
  }

  // Get remaining content from other rows
  rows.slice(1).forEach((row) => {
    const cells = [...row.children];
    cells.forEach((cell) => {
      contentCells.push(cell);
    });
  });

  // Parse content
  let title = '';
  let rating = 5;
  let reviewCount = 0;
  let description = '';
  let totalTime = '30 Minutes';
  let yieldText = '2 servings';
  let difficulty = 'Easy';
  let dietaryInterests = '';
  let submittedBy = 'VITAMIX';

  contentCells.forEach((cell) => {
    const h1 = cell.querySelector('h1');
    if (h1) {
      title = h1.textContent;
      return;
    }

    const text = cell.textContent.trim();

    // Check for rating pattern (e.g., "5|0" for rating|reviewCount)
    if (text.match(/^\d(\.\d)?[|,]\d+$/)) {
      const parts = text.split(/[|,]/);
      rating = parseFloat(parts[0]);
      reviewCount = parseInt(parts[1], 10);
      return;
    }

    // Check for metadata pattern (time|yield|difficulty)
    if (text.includes('|') && (text.toLowerCase().includes('minute') || text.toLowerCase().includes('serving'))) {
      const parts = text.split('|').map((p) => p.trim());
      if (parts[0]) totalTime = parts[0];
      if (parts[1]) yieldText = parts[1];
      if (parts[2]) difficulty = parts[2];
      return;
    }

    // Check for attribution pattern (dietary|submittedBy)
    if (text.toLowerCase().includes('submitted') || text.includes('VITAMIX')) {
      const parts = text.split('|').map((p) => p.trim());
      if (parts.length === 2) {
        dietaryInterests = parts[0];
        submittedBy = parts[1].replace(/submitted by:?\s*/i, '');
      } else {
        submittedBy = text.replace(/submitted by:?\s*/i, '');
      }
      return;
    }

    // Otherwise, it's the description
    if (text && !title) {
      description = text;
    } else if (text && title && !description) {
      description = text;
    }
  });

  // Preserve data-gen-image attribute
  const img = imageCell?.querySelector('img');
  const genImageId = img?.dataset?.genImage || '';

  // Build new HTML structure
  const imageHtml = imageCell ? `
    <div class="recipe-hero-detail-image">
      ${imageCell.innerHTML}
    </div>
  ` : '';

  const contentHtml = `
    <div class="recipe-hero-detail-content">
      <h1>${title}</h1>
      ${description ? `<p class="recipe-hero-detail-description">${description}</p>` : ''}
      ${createMetadata(totalTime, yieldText, difficulty)}
    </div>
  `;

  block.innerHTML = imageHtml + contentHtml;

  // Re-apply data-gen-image to the image
  if (genImageId) {
    const newImg = block.querySelector('img');
    if (newImg) {
      newImg.dataset.genImage = genImageId;
    }
  }
}
