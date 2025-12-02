/**
 * Troubleshooting Steps Block
 *
 * Numbered step-by-step instructions with optional illustrations.
 * Vertical timeline layout with images.
 *
 * Content Model (DA Table - each row is a step with cells):
 * | Troubleshooting Steps                                            |
 * |------------------------------------------------------------------|
 * | 1 | Unplug your Vitamix | Always disconnect power... | safety:.. |
 * | 2 | Check for trapped ingredients | Remove the container...      |
 */
export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length === 0) return;

  const steps = [];

  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length === 0) return;

    // Table row format: | number | title | instructions | safety? |
    const numberText = cells[0]?.textContent?.trim() || '';
    const title = cells[1]?.textContent?.trim() || '';
    const instructions = cells[2]?.textContent?.trim() || '';
    const safetyCell = cells[3]?.textContent?.trim() || '';

    if (/^\d{1,2}$/.test(numberText) && title) {
      steps.push({
        number: parseInt(numberText, 10),
        title,
        instructions,
        safetyNote: safetyCell.replace(/^safety[:\s]*/i, ''),
      });
    }
  });

  if (steps.length === 0) return;

  // Build steps timeline
  const timeline = document.createElement('div');
  timeline.className = 'troubleshooting-timeline';

  steps.forEach((step, index) => {
    const stepEl = document.createElement('div');
    stepEl.className = 'troubleshooting-step';

    // Step indicator (number with line)
    const indicator = document.createElement('div');
    indicator.className = 'step-indicator';

    const number = document.createElement('span');
    number.className = 'step-number';
    number.textContent = step.number;
    indicator.appendChild(number);

    // Add connecting line (except for last step)
    if (index < steps.length - 1) {
      const line = document.createElement('span');
      line.className = 'step-line';
      indicator.appendChild(line);
    }

    stepEl.appendChild(indicator);

    // Step content
    const content = document.createElement('div');
    content.className = 'step-content';

    // Title
    const title = document.createElement('h3');
    title.className = 'step-title';
    title.textContent = step.title;
    content.appendChild(title);

    // Instructions
    if (step.instructions) {
      const instructions = document.createElement('p');
      instructions.className = 'step-instructions';
      instructions.textContent = step.instructions;
      content.appendChild(instructions);
    }

    // Safety note
    if (step.safetyNote) {
      const safetyNote = document.createElement('div');
      safetyNote.className = 'step-safety-note';
      safetyNote.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <span>${step.safetyNote}</span>
      `;
      content.appendChild(safetyNote);
    }

    // Image (if present)
    if (step.image) {
      const imageWrapper = document.createElement('div');
      imageWrapper.className = 'step-image';
      imageWrapper.appendChild(step.image);
      content.appendChild(imageWrapper);
    }

    stepEl.appendChild(content);
    timeline.appendChild(stepEl);
  });

  // Clear and append
  block.textContent = '';
  block.appendChild(timeline);
}
