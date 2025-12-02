/**
 * Nutrition Facts Block
 *
 * Displays nutrition information in a table format.
 * HTML structure from orchestrator:
 * <div class="nutrition-facts">
 *   <div class="nutrition-header">
 *     <h3>Nutrition Facts</h3>
 *     <p>Per X serving</p>
 *   </div>
 *   <div class="nutrition-table">
 *     <p>Calories</p><p>120</p>
 *     <p>Total Fat</p><p>2g</p>
 *     ...
 *   </div>
 * </div>
 */

export default function decorate(block) {
  const rows = [...block.children];

  // First row is the header
  if (rows[0]) {
    rows[0].classList.add('nutrition-facts-header');
  }

  // Second row contains the nutrition data
  if (rows[1]) {
    rows[1].classList.add('nutrition-facts-table');

    // Group paragraphs into pairs (label + value)
    const paragraphs = [...rows[1].querySelectorAll('p')];
    const table = document.createElement('div');
    table.className = 'nutrition-grid';

    for (let i = 0; i < paragraphs.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'nutrition-row';

      const label = document.createElement('span');
      label.className = 'nutrition-label';
      label.textContent = paragraphs[i]?.textContent || '';

      const value = document.createElement('span');
      value.className = 'nutrition-value';
      value.textContent = paragraphs[i + 1]?.textContent || '';

      row.appendChild(label);
      row.appendChild(value);
      table.appendChild(row);
    }

    rows[1].innerHTML = '';
    rows[1].appendChild(table);
  }
}
