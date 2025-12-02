/**
 * Comparison Table Block
 *
 * Side-by-side product comparison with specs and winner indicators.
 * Supports 2-4 products dynamically.
 *
 * Content Model (DA Table):
 * | Comparison Table |
 * |------------------|
 * |                  | A3500 | A2500 | E310  |  <- Header row
 * | **Price**        | $649  | $549  | $349  |  <- Spec rows
 * | **Motor**        | 2.2HP | 2.2HP | 2.0HP |
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length === 0) return;

  // Create table structure
  const table = document.createElement('table');
  table.className = 'comparison-table-grid';

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // Process first row as header (product names)
  const headerRow = rows[0];
  if (headerRow) {
    const tr = document.createElement('tr');
    const cells = [...headerRow.children];

    cells.forEach((cell, idx) => {
      const th = document.createElement('th');
      th.scope = idx === 0 ? 'col' : 'col';

      // First cell is empty or "vs" label
      if (idx === 0) {
        th.className = 'comparison-table-corner';
        th.textContent = cell.textContent.trim() || '';
      } else {
        th.className = 'comparison-table-product';
        // Extract product name (might be in strong tag)
        const strong = cell.querySelector('strong');
        th.textContent = strong ? strong.textContent : cell.textContent.trim();
      }
      tr.appendChild(th);
    });

    thead.appendChild(tr);
  }

  // Process remaining rows as spec comparisons
  rows.slice(1).forEach((row) => {
    const tr = document.createElement('tr');
    const cells = [...row.children];

    cells.forEach((cell, idx) => {
      const td = document.createElement(idx === 0 ? 'th' : 'td');
      if (idx === 0) {
        td.scope = 'row';
        td.className = 'comparison-table-spec';
        // Spec name - might be in strong tag
        const strong = cell.querySelector('strong');
        td.textContent = strong ? strong.textContent : cell.textContent.trim();
      } else {
        td.className = 'comparison-table-value';
        const text = cell.textContent.trim();

        // Check for winner indicators
        if (text.includes('✓')) {
          td.classList.add('winner');
        }
        if (text.includes('✗')) {
          td.classList.add('missing');
        }

        // Parse value and indicator
        const valueSpan = document.createElement('span');
        valueSpan.className = 'value';
        valueSpan.textContent = text.replace(/[✓✗]/g, '').trim();

        td.appendChild(valueSpan);

        // Add winner/missing indicator
        if (text.includes('✓')) {
          const indicator = document.createElement('span');
          indicator.className = 'winner-indicator';
          indicator.setAttribute('aria-label', 'Best in category');
          indicator.textContent = '✓';
          td.appendChild(indicator);
        }
        if (text.includes('✗')) {
          const indicator = document.createElement('span');
          indicator.className = 'missing-indicator';
          indicator.setAttribute('aria-label', 'Not available');
          indicator.textContent = '✗';
          td.appendChild(indicator);
        }
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);

  // Track number of products for responsive styling
  const productCount = rows[0] ? [...rows[0].children].length - 1 : 0;
  block.dataset.products = productCount;

  block.textContent = '';
  block.appendChild(table);
}
