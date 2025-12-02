/**
 * Recipe Sidebar Block
 *
 * Left sidebar with action buttons, container size selector, and nutrition facts.
 *
 * Content Model (DA Table):
 * | Recipe Sidebar |                  |
 * |----------------|------------------|
 * | containerSizes | 64-oz Low,64-oz Classic,48-oz |
 * | servingSize    | 1 serving (542 g)|
 * | calories       | 240              |
 * | totalFat       | 7G               |
 * | totalCarb      | 44G              |
 * | fiber          | 12G              |
 * | sugars         | 8G               |
 * | protein        | 4G               |
 * | cholesterol    | 0MG              |
 * | sodium         | 300MG            |
 * | saturatedFat   | 1G               |
 *
 * HTML structure after decoration:
 * <div class="recipe-sidebar">
 *   <div class="actions-bar">...</div>
 *   <div class="container-select">...</div>
 *   <div class="nutrition-panel">...</div>
 * </div>
 */

const ICONS = {
  save: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
  print: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
  share: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  chevronUp: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
  chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
};

const DEFAULT_CONTAINER_SIZES = [
  '64-ounce Low Profile',
  '64-ounce Classic',
  '48-ounce',
];

const DEFAULT_NUTRITION = {
  servingSize: '1 serving (542 g)',
  facts: [
    { label: 'CALORIES', value: '240', indent: false },
    { label: 'TOTAL FAT', value: '7G', indent: false },
    { label: 'TOTAL CARBOHYDRATE', value: '44G', indent: false },
    { label: 'DIETARY FIBER', value: '12G', indent: true },
    { label: 'SUGARS', value: '8G', indent: true },
    { label: 'PROTEIN', value: '4G', indent: false },
    { label: 'CHOLESTEROL', value: '0MG', indent: false },
    { label: 'SODIUM', value: '300MG', indent: false },
    { label: 'SATURATED FAT', value: '1G', indent: false },
  ],
};

function parseNutritionFromRows(rows) {
  const nutrition = { ...DEFAULT_NUTRITION, facts: [] };

  rows.forEach((row) => {
    const cells = [...row.children];
    if (cells.length >= 2) {
      const label = cells[0].textContent.trim().toUpperCase();
      const value = cells[1].textContent.trim().toUpperCase();

      if (label === 'SERVINGSIZE' || label === 'SERVING SIZE') {
        nutrition.servingSize = value;
      } else if (label === 'CONTAINERSIZES' || label === 'CONTAINER SIZES') {
        // Skip, handled separately
      } else if (label && value) {
        const isIndent = label.includes('FIBER') || label.includes('SUGAR');
        nutrition.facts.push({ label, value, indent: isIndent });
      }
    }
  });

  if (nutrition.facts.length === 0) {
    nutrition.facts = DEFAULT_NUTRITION.facts;
  }

  return nutrition;
}

function parseContainerSizes(rows) {
  for (const row of rows) {
    const cells = [...row.children];
    if (cells.length >= 2) {
      const label = cells[0].textContent.trim().toLowerCase();
      if (label === 'containersizes' || label === 'container sizes') {
        const sizes = cells[1].textContent.split(',').map((s) => s.trim()).filter(Boolean);
        if (sizes.length > 0) return sizes;
      }
    }
  }
  return DEFAULT_CONTAINER_SIZES;
}

export default function decorate(block) {
  const rows = [...block.children];

  // Parse content
  const nutrition = parseNutritionFromRows(rows);

  // Build nutrition panel only
  const nutritionFactsHtml = nutrition.facts.map((fact) => `
    <div class="nutrition-row${fact.indent ? ' indent' : ''}">
      <span class="nutrition-label">${fact.label}</span>
      <span class="nutrition-value">${fact.value}</span>
    </div>
  `).join('');

  block.innerHTML = `
    <div class="recipe-sidebar-nutrition">
      <div class="nutrition-header">
        <span class="nutrition-title">Nutrition</span>
        <span class="nutrition-serving">${nutrition.servingSize}</span>
      </div>
      <div class="nutrition-facts">
        ${nutritionFactsHtml}
      </div>
    </div>
  `;
}
