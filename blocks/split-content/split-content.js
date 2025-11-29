/**
 * Split Content Block
 *
 * 50/50 or 60/40 image and text layouts for feature sections.
 * Aligned with vitamix.com split section patterns.
 *
 * == DA/EDS Table Structure ==
 *
 * | Split Content (reverse)   |                              |
 * |-----------------------------|------------------------------|
 * | [feature-image.jpg]       | EYEBROW TEXT                 |
 * |                           | ## Section Headline          |
 * |                           | Body text paragraph here.    |
 * |                           | [[Learn More]]               |
 *
 * Variants:
 * - reverse: Image on right side instead of left
 * - dark: Dark background with white text
 * - light: Light gray background
 * - ratio-60-40: 60% image, 40% content
 * - centered: Vertically center content
 */

export default function decorate(block) {
  const row = block.firstElementChild;
  if (!row) return;

  const cells = [...row.children];

  cells.forEach((cell, index) => {
    const pic = cell.querySelector('picture');

    if (pic) {
      // This is the image cell
      cell.classList.add('split-content-image');
    } else {
      // This is the content cell
      cell.classList.add('split-content-body');

      // Process content to identify eyebrow text
      const firstP = cell.querySelector('p:first-child');
      if (firstP) {
        const text = firstP.textContent.trim();
        // Eyebrow detection: short text (under 50 chars), no period, often uppercase
        const isEyebrow = text.length < 50
          && !text.includes('.')
          && !firstP.querySelector('a')
          && text === text.toUpperCase();

        if (isEyebrow) {
          firstP.classList.add('eyebrow');
        }
      }
    }
  });

  // Wrap row for proper grid styling
  row.classList.add('split-content-wrapper');
}
