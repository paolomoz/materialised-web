/**
 * Recipe Filter Bar Block
 *
 * Interactive filter controls with difficulty slider and time buttons.
 * Emits custom events to filter the recipe-grid block.
 *
 * Content Model (DA Table):
 * | Recipe Filter Bar                          |
 * |--------------------------------------------|
 * | Difficulty                                 |
 * | All | Quick | Medium | Long               |
 */

export default function decorate(block) {
  // Build filter UI
  block.innerHTML = `
    <div class="recipe-filter-bar-inner">
      <div class="filter-group filter-difficulty">
        <label class="filter-label" for="difficulty-slider">Difficulty</label>
        <div class="slider-wrapper">
          <span class="slider-label slider-label-min">Easy</span>
          <input
            type="range"
            id="difficulty-slider"
            class="difficulty-slider"
            min="1"
            max="5"
            value="5"
            step="1"
          >
          <span class="slider-label slider-label-max">Advanced</span>
        </div>
        <div class="slider-value">
          <span class="difficulty-display">All levels</span>
        </div>
      </div>

      <div class="filter-divider"></div>

      <div class="filter-group filter-time">
        <label class="filter-label">Prep Time</label>
        <div class="time-buttons">
          <button class="time-btn active" data-time="all">All</button>
          <button class="time-btn" data-time="5">&lt;5 min</button>
          <button class="time-btn" data-time="10">&lt;10 min</button>
          <button class="time-btn" data-time="20">&lt;20 min</button>
          <button class="time-btn" data-time="30">30+ min</button>
        </div>
      </div>

      <div class="filter-divider"></div>

      <div class="filter-group filter-count">
        <span class="recipe-count">
          <span class="count-number">0</span> recipes
        </span>
        <button class="reset-filters" hidden>Reset filters</button>
      </div>
    </div>
  `;

  const slider = block.querySelector('.difficulty-slider');
  const difficultyDisplay = block.querySelector('.difficulty-display');
  const timeButtons = block.querySelectorAll('.time-btn');
  const recipeCountEl = block.querySelector('.count-number');
  const resetBtn = block.querySelector('.reset-filters');

  const difficultyLabels = {
    1: 'Easy only',
    2: 'Easy to Simple',
    3: 'Up to Moderate',
    4: 'Up to Challenging',
    5: 'All levels',
  };

  let currentFilters = {
    maxDifficulty: 5,
    maxTime: 'all',
  };

  // Emit filter change event
  function emitFilterChange() {
    const event = new CustomEvent('recipe-filter-change', {
      bubbles: true,
      detail: { ...currentFilters },
    });
    block.dispatchEvent(event);

    // Show/hide reset button
    const isDefault = currentFilters.maxDifficulty === 5 && currentFilters.maxTime === 'all';
    resetBtn.hidden = isDefault;
  }

  // Update difficulty display
  function updateDifficultyDisplay(value) {
    difficultyDisplay.textContent = difficultyLabels[value];
    currentFilters.maxDifficulty = parseInt(value, 10);
    emitFilterChange();
  }

  // Slider input
  slider.addEventListener('input', (e) => {
    updateDifficultyDisplay(e.target.value);
  });

  // Time button clicks
  timeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      timeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilters.maxTime = btn.dataset.time;
      emitFilterChange();
    });
  });

  // Reset filters
  resetBtn.addEventListener('click', () => {
    slider.value = 5;
    updateDifficultyDisplay(5);
    timeButtons.forEach((b) => b.classList.remove('active'));
    timeButtons[0].classList.add('active');
    currentFilters.maxTime = 'all';
    emitFilterChange();
  });

  // Listen for recipe count updates from recipe-grid
  document.addEventListener('recipe-count-update', (e) => {
    recipeCountEl.textContent = e.detail.count;
  });

  // Initial count will be updated by recipe-grid on load
}
