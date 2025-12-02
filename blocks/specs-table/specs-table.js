/**
 * Specs Table Block
 *
 * Vertical list layout with label/value pairs.
 *
 * Content Model (generative):
 * Each row is a spec with two cells: label | value
 *
 * Content Model (DA Table):
 * | Specs Table |
 * |-------------|
 * | Motor | 2.2 HP Peak |
 * | Container | 64 oz |
 */
export default function decorate(block) {
  const rows = [...block.children];

  rows.forEach((row) => {
    const cells = [...row.children];

    // Handle two-cell rows (label | value)
    if (cells.length === 2) {
      cells[0].classList.add('specs-table-label');
      cells[1].classList.add('specs-table-value');
    } else if (cells.length === 1) {
      // Handle single cell with strong/text pattern (DA authoring)
      const cell = cells[0];
      const strong = cell.querySelector('strong');
      if (strong) {
        const label = document.createElement('div');
        label.className = 'specs-table-label';
        label.textContent = strong.textContent;

        const value = document.createElement('div');
        value.className = 'specs-table-value';
        const fullText = cell.textContent;
        value.textContent = fullText.replace(strong.textContent, '').trim();

        row.textContent = '';
        row.appendChild(label);
        row.appendChild(value);
      }
    }
  });
}
