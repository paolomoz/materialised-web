/**
 * Cards Block
 *
 * == DA/EDS Table Structure ==
 * Authored as a table with "Cards" header row:
 *
 * | Cards                                    |                                |
 * |------------------------------------------|--------------------------------|
 * | [image]                                  | **Title 1**                    |
 * |                                          | Description text               |
 * |                                          | [Link text](url)               |
 * |------------------------------------------|--------------------------------|
 * | [image]                                  | **Title 2**                    |
 * |                                          | Description text               |
 * |                                          | [Link text](url)               |
 *
 * Each row becomes a card. Each row has 2 cells: image cell and body cell.
 *
 * This converts to HTML after EDS processing:
 * <div class="cards">
 *   <div>                                    <!-- card row -->
 *     <div><picture>...</picture></div>      <!-- image cell -->
 *     <div>                                  <!-- body cell -->
 *       <p><strong>Title</strong></p>
 *       <p>Description</p>
 *       <p><a href="...">Link</a></p>
 *     </div>
 *   </div>
 *   ...
 * </div>
 *
 * The decorator transforms this into:
 * <div class="cards">
 *   <ul>
 *     <li>
 *       <div class="cards-card-image"><picture>...</picture></div>
 *       <div class="cards-card-body">...</div>
 *     </li>
 *     ...
 *   </ul>
 * </div>
 */

import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) {
        div.className = 'cards-card-image';
      } else {
        div.className = 'cards-card-body';
      }
    });
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => {
    // Skip optimization for generated images - they have data-gen-image attribute
    // and will be replaced with actual images via SSE events
    if (img.hasAttribute('data-gen-image')) {
      return;
    }
    // Skip optimization for external images (different hostname)
    try {
      const imgUrl = new URL(img.src, window.location.href);
      if (imgUrl.hostname !== window.location.hostname) {
        return;
      }
    } catch (e) {
      // If URL parsing fails, skip optimization
      return;
    }
    img.closest('picture').replaceWith(
      createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]),
    );
  });
  block.replaceChildren(ul);
}
