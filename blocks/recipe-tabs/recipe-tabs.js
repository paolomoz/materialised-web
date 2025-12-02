/**
 * Recipe Tabs Block
 *
 * Navigation tabs for recipe page sections with Cook Mode toggle.
 * Dark background bar with tabs: THE RECIPE, NUTRITIONAL FACTS, RELATED RECIPES, REVIEWS
 *
 * Content Model (DA Table):
 * | Recipe Tabs  |             |              |            |
 * |--------------|-------------|--------------|------------|
 * | THE RECIPE   | NUTRITIONAL | RELATED      | REVIEWS    |
 *
 * HTML structure after decoration:
 * <div class="recipe-tabs">
 *   <nav class="recipe-tabs-nav">
 *     <button class="tab active">THE RECIPE</button>
 *     ...
 *   </nav>
 *   <div class="recipe-tabs-cook-mode">
 *     <span>COOK MODE</span>
 *     <button class="toggle">...</button>
 *   </div>
 * </div>
 */

const DEFAULT_TABS = [
  { id: 'recipe', label: 'THE RECIPE' },
  { id: 'nutrition', label: 'NUTRITIONAL FACTS' },
  { id: 'related', label: 'RELATED RECIPES' },
];

const ICONS = {
  help: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

export default function decorate(block) {
  const rows = [...block.children];

  // Parse tabs from content or use defaults
  let tabs = [];
  if (rows[0]) {
    const cells = [...rows[0].children];
    cells.forEach((cell, index) => {
      const text = cell.textContent.trim();
      if (text) {
        tabs.push({
          id: text.toLowerCase().replace(/\s+/g, '-'),
          label: text.toUpperCase(),
        });
      }
    });
  }

  if (tabs.length === 0) {
    tabs = DEFAULT_TABS;
  }

  // Build tabs HTML
  const tabsHtml = tabs.map((tab, index) => `
    <button
      class="recipe-tab${index === 0 ? ' active' : ''}"
      data-tab="${tab.id}"
      role="tab"
      aria-selected="${index === 0}"
      tabindex="${index === 0 ? 0 : -1}"
    >${tab.label}</button>
  `).join('');

  // Build block HTML
  block.innerHTML = `
    <div class="recipe-tabs-accent"></div>
    <nav class="recipe-tabs-nav" role="tablist" aria-label="Recipe sections">
      ${tabsHtml}
    </nav>
  `;

  // Add tab click handlers
  const tabButtons = block.querySelectorAll('.recipe-tab');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Update active state
      tabButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
        b.setAttribute('tabindex', '-1');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      btn.setAttribute('tabindex', '0');

      // Scroll to section if exists
      const targetId = btn.dataset.tab;
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Add keyboard navigation
  const tablist = block.querySelector('.recipe-tabs-nav');
  tablist.addEventListener('keydown', (e) => {
    const tabs = [...tablist.querySelectorAll('.recipe-tab')];
    const currentIndex = tabs.findIndex((t) => t === document.activeElement);

    if (e.key === 'ArrowRight') {
      const nextIndex = (currentIndex + 1) % tabs.length;
      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    } else if (e.key === 'ArrowLeft') {
      const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      tabs[prevIndex].focus();
      tabs[prevIndex].click();
    }
  });

}
