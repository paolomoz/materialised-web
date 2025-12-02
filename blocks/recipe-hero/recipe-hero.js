/**
 * Recipe Hero Block
 *
 * Displays a recipe hero with image, title, description, and metadata.
 * HTML structure from orchestrator:
 * <div class="recipe-hero">
 *   <div><picture><img alt="Recipe" /></picture></div>
 *   <div>
 *     <h1>Recipe Title</h1>
 *     <p>Description</p>
 *     <p>10 minutes prep • 5 minutes cook • 4 servings • Easy</p>
 *   </div>
 * </div>
 */

export default function decorate(block) {
  const rows = [...block.children];

  if (rows[0]) {
    rows[0].classList.add('recipe-hero-image');
  }

  if (rows[1]) {
    rows[1].classList.add('recipe-hero-content');

    // Find and style metadata line (prep time, cook time, servings)
    const paragraphs = rows[1].querySelectorAll('p');
    paragraphs.forEach((p) => {
      const text = p.textContent;
      if (text.includes('•') || text.includes('minutes') || text.includes('servings')) {
        p.classList.add('recipe-hero-meta');
      } else {
        p.classList.add('recipe-hero-description');
      }
    });
  }
}
