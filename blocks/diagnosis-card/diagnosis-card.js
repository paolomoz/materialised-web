/**
 * Diagnosis Card Block
 *
 * Quick severity assessment - helps users understand issue severity.
 * Color-coded cards (green/yellow/red) showing possible causes by severity.
 *
 * Content Model (DA Table):
 * | Diagnosis Card                |                        |                      |
 * |-------------------------------|------------------------|----------------------|
 * | minor                         | moderate               | serious              |
 * | Ice or frozen ingredients     | Blade wear or buildup  | Motor issue          |
 * | Normal during hard blending   | May need cleaning      | Requires service     |
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length < 2) return;

  // Parse rows: first row is severity levels, subsequent rows are content
  const severityRow = rows[0];
  const contentRows = rows.slice(1);

  const severityCells = [...severityRow.children];
  const diagnosisItems = [];

  // Build diagnosis items from columns
  severityCells.forEach((cell, index) => {
    const severity = cell.textContent.trim().toLowerCase();

    // Get corresponding content from subsequent rows
    const cause = contentRows[0]?.children[index]?.textContent.trim() || '';
    const implication = contentRows[1]?.children[index]?.textContent.trim() || '';

    if (severity) {
      diagnosisItems.push({
        severity,
        cause,
        implication,
      });
    }
  });

  // Build card grid
  const grid = document.createElement('div');
  grid.className = 'diagnosis-card-grid';

  diagnosisItems.forEach((item) => {
    const card = document.createElement('div');
    card.className = `diagnosis-card-item diagnosis-${item.severity}`;

    // Severity indicator
    const indicator = document.createElement('div');
    indicator.className = 'diagnosis-indicator';

    const dot = document.createElement('span');
    dot.className = 'diagnosis-dot';
    indicator.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'diagnosis-label';
    label.textContent = item.severity.charAt(0).toUpperCase() + item.severity.slice(1);
    indicator.appendChild(label);

    card.appendChild(indicator);

    // Cause
    if (item.cause) {
      const cause = document.createElement('h3');
      cause.className = 'diagnosis-cause';
      cause.textContent = item.cause;
      card.appendChild(cause);
    }

    // Implication
    if (item.implication) {
      const implication = document.createElement('p');
      implication.className = 'diagnosis-implication';
      implication.textContent = item.implication;
      card.appendChild(implication);
    }

    grid.appendChild(card);
  });

  // Clear and append
  block.textContent = '';
  block.appendChild(grid);
}
