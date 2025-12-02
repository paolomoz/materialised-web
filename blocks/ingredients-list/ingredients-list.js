/**
 * Ingredients List Block
 *
 * Displays recipe ingredients with Imperial/Metric unit toggle.
 * Matches vitamix.com single recipe page design.
 *
 * HTML structure from orchestrator:
 * <div class="ingredients-list">
 *   <div><div><h2>Ingredients</h2></div></div>
 *   <div>
 *     <div>3 cups (420 g)</div>
 *     <div>acorn squash, peeled, seeded and cut into 1" cubes</div>
 *   </div>
 *   ...
 * </div>
 *
 * HTML structure after decoration:
 * <div class="ingredients-list">
 *   <div class="ingredients-header">
 *     <h2>Ingredients</h2>
 *     <div class="unit-toggle">
 *       <button class="active">Imperial System</button>
 *       <button>Metric System</button>
 *     </div>
 *   </div>
 *   <ul class="ingredients-items">
 *     <li>...</li>
 *   </ul>
 * </div>
 */

// Unit conversion utilities
const CONVERSIONS = {
  cup: { factor: 236.588, unit: 'ml' },
  cups: { factor: 236.588, unit: 'ml' },
  tablespoon: { factor: 15, unit: 'ml' },
  tablespoons: { factor: 15, unit: 'ml' },
  teaspoon: { factor: 5, unit: 'ml' },
  teaspoons: { factor: 5, unit: 'ml' },
  ounce: { factor: 28.35, unit: 'g' },
  ounces: { factor: 28.35, unit: 'g' },
  oz: { factor: 28.35, unit: 'g' },
  pound: { factor: 453.592, unit: 'g' },
  pounds: { factor: 453.592, unit: 'g' },
  lb: { factor: 453.592, unit: 'g' },
  lbs: { factor: 453.592, unit: 'g' },
};

function parseAmount(text) {
  // Parse amounts like "3 cups (420 g)" or "1/2 small (60 g)"
  const match = text.match(/^([\d\/\s.]+)\s*(\w+)?\s*(?:\([\d\s.]+\s*\w+\))?/i);
  if (match) {
    let value = match[1].trim();
    // Convert fractions
    if (value.includes('/')) {
      const parts = value.split(/\s+/);
      let total = 0;
      parts.forEach((part) => {
        if (part.includes('/')) {
          const [num, den] = part.split('/');
          total += parseInt(num, 10) / parseInt(den, 10);
        } else {
          total += parseFloat(part) || 0;
        }
      });
      value = total;
    } else {
      value = parseFloat(value);
    }
    return { value, unit: match[2] || '' };
  }
  return null;
}

function convertToMetric(amountText) {
  const parsed = parseAmount(amountText);
  if (!parsed || !parsed.unit) return amountText;

  const conversion = CONVERSIONS[parsed.unit.toLowerCase()];
  if (!conversion) return amountText;

  const metricValue = Math.round(parsed.value * conversion.factor);
  return `${metricValue} ${conversion.unit}`;
}

export default function decorate(block) {
  const rows = [...block.children];

  // Parse ingredients
  const ingredients = [];
  let title = 'Ingredients';

  rows.forEach((row) => {
    const cells = [...row.children];

    // Check for header
    const h2 = row.querySelector('h2');
    if (h2) {
      title = h2.textContent.trim() || 'Ingredients';
      return;
    }

    // Check if it's a section label
    if (row.querySelector('strong') && cells.length === 1) {
      ingredients.push({ type: 'section', text: cells[0].textContent.trim() });
      return;
    }

    // Parse ingredient
    if (cells.length >= 2) {
      const amount = cells[0].textContent.trim();
      const name = cells[1].textContent.trim();
      const note = cells[2]?.textContent.trim() || '';

      // Check if amount already has metric in parentheses
      const hasMetric = amount.includes('(') && amount.includes('g');
      const metricAmount = hasMetric ? amount.match(/\(([^)]+)\)/)?.[1] : convertToMetric(amount);
      const imperialAmount = hasMetric ? amount.replace(/\s*\([^)]+\)/, '') : amount;

      ingredients.push({
        type: 'ingredient',
        imperial: `${imperialAmount} ${name}${note ? ` [${note}]` : ''}`,
        metric: `${metricAmount} ${name}${note ? ` [${note}]` : ''}`,
        imperialAmount,
        metricAmount,
        name,
        note,
      });
    } else if (cells.length === 1 && !row.querySelector('h2, strong')) {
      // Single cell ingredient (full text)
      const text = cells[0].textContent.trim();
      if (text) {
        ingredients.push({
          type: 'ingredient',
          imperial: text,
          metric: text,
          imperialAmount: '',
          metricAmount: '',
          name: text,
          note: '',
        });
      }
    }
  });

  // Build HTML - simple bulleted list
  const ingredientsHtml = ingredients.map((ing) => {
    if (ing.type === 'section') {
      return `<li class="ingredient-section"><strong>${ing.text}</strong></li>`;
    }
    // Use imperial format only
    const text = ing.imperialAmount
      ? `${ing.imperialAmount} ${ing.name}${ing.note ? `, ${ing.note}` : ''}`
      : ing.name;
    return `<li class="ingredient-item">${text}</li>`;
  }).join('');

  block.innerHTML = `
    <div class="ingredients-header">
      <h2>${title}</h2>
    </div>
    <ul class="ingredients-items">
      ${ingredientsHtml}
    </ul>
  `;
}
