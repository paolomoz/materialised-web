/**
 * Recipe Tips Block
 *
 * Displays recipe tips and variations in organized sections.
 * HTML structure from orchestrator:
 * <div class="recipe-tips">
 *   <div><h2>Pro Tips</h2></div>
 *   <div class="tip">
 *     <p><strong>Tip Title</strong></p>
 *     <p>Tip description</p>
 *   </div>
 *   <div><h3>Variations</h3></div>
 *   <div class="variation">
 *     <p><strong>Variation Title</strong></p>
 *     <p>Variation description</p>
 *   </div>
 *   ...
 * </div>
 */

export default function decorate(block) {
  const rows = [...block.children];

  rows.forEach((row) => {
    // Check if it's a section header
    if (row.querySelector('h2') || row.querySelector('h3')) {
      row.classList.add('recipe-tips-section-header');
      return;
    }

    // Otherwise it's a tip or variation item
    row.classList.add('recipe-tips-item');

    // Find title and description
    const paragraphs = row.querySelectorAll('p');
    paragraphs.forEach((p) => {
      if (p.querySelector('strong')) {
        p.classList.add('recipe-tips-item-title');
      } else {
        p.classList.add('recipe-tips-item-description');
      }
    });
  });
}
