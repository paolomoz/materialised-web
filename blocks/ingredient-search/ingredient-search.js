/**
 * Ingredient Search Block
 *
 * AI-powered ingredient input that matches or generates recipes.
 * Users can type ingredients they have, and the block calls the
 * worker API to find matching recipes.
 *
 * Content Model (DA Table):
 * | Ingredient Search                          |
 * |--------------------------------------------|
 * | ## What's in your kitchen?                 |
 * | Enter ingredients you have on hand         |
 * | /api/ingredient-match                      |
 */

const WORKER_URL = 'https://vitamix-generative.paolo-moz.workers.dev';

export default function decorate(block) {
  const rows = [...block.children];
  let headline = "What's in your kitchen?";
  let subtext = 'Enter ingredients you have on hand and discover recipes you can make';
  let apiEndpoint = '/api/ingredient-match';

  // Parse content from rows
  rows.forEach((row) => {
    const text = row.textContent.trim();
    const h2 = row.querySelector('h2');
    if (h2) {
      headline = h2.textContent;
    } else if (text.startsWith('/api')) {
      apiEndpoint = text;
    } else if (text && !text.startsWith('/')) {
      subtext = text;
    }
  });

  // Build the search UI
  block.innerHTML = `
    <div class="ingredient-search-inner">
      <div class="ingredient-search-header">
        <h2>${headline}</h2>
        <p>${subtext}</p>
      </div>
      <div class="ingredient-search-form">
        <div class="ingredient-input-wrapper">
          <div class="ingredient-tags"></div>
          <input
            type="text"
            class="ingredient-input"
            placeholder="Type an ingredient and press Enter..."
            autocomplete="off"
          >
        </div>
        <button class="ingredient-search-btn" type="button">
          <span class="btn-text">Invent Recipes</span>
          <span class="btn-loading" hidden>
            <svg class="spinner" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.4" stroke-dashoffset="10"/>
            </svg>
          </span>
        </button>
      </div>
      <div class="ingredient-suggestions">
        <span class="suggestion-label">Popular:</span>
        <button class="suggestion-chip" data-ingredient="banana">banana</button>
        <button class="suggestion-chip" data-ingredient="spinach">spinach</button>
        <button class="suggestion-chip" data-ingredient="berries">berries</button>
        <button class="suggestion-chip" data-ingredient="almond milk">almond milk</button>
        <button class="suggestion-chip" data-ingredient="yogurt">yogurt</button>
      </div>
      <div class="ingredient-results" hidden>
        <div class="results-header">
          <h3>Recipes you can make</h3>
          <button class="results-clear">Clear search</button>
        </div>
        <div class="results-grid"></div>
      </div>
    </div>
  `;

  const input = block.querySelector('.ingredient-input');
  const tagsContainer = block.querySelector('.ingredient-tags');
  const searchBtn = block.querySelector('.ingredient-search-btn');
  const suggestions = block.querySelectorAll('.suggestion-chip');
  const resultsSection = block.querySelector('.ingredient-results');
  const resultsGrid = block.querySelector('.results-grid');
  const clearBtn = block.querySelector('.results-clear');

  const ingredients = new Set();

  // Add ingredient tag
  function addIngredient(ingredient) {
    const normalized = ingredient.toLowerCase().trim();
    if (!normalized || ingredients.has(normalized)) return;

    ingredients.add(normalized);

    const tag = document.createElement('span');
    tag.className = 'ingredient-tag';
    tag.innerHTML = `
      ${normalized}
      <button class="tag-remove" data-ingredient="${normalized}">&times;</button>
    `;
    tagsContainer.appendChild(tag);

    tag.querySelector('.tag-remove').addEventListener('click', () => {
      ingredients.delete(normalized);
      tag.remove();
    });

    input.value = '';
  }

  // Handle input
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      addIngredient(input.value);
    } else if (e.key === 'Backspace' && !input.value && ingredients.size > 0) {
      // Remove last tag on backspace
      const lastTag = tagsContainer.lastElementChild;
      if (lastTag) {
        const ing = lastTag.querySelector('.tag-remove').dataset.ingredient;
        ingredients.delete(ing);
        lastTag.remove();
      }
    }
  });

  // Handle suggestion clicks
  suggestions.forEach((chip) => {
    chip.addEventListener('click', () => {
      addIngredient(chip.dataset.ingredient);
    });
  });

  // Search button click
  searchBtn.addEventListener('click', async () => {
    if (ingredients.size === 0) {
      input.focus();
      return;
    }

    const btnText = searchBtn.querySelector('.btn-text');
    const btnLoading = searchBtn.querySelector('.btn-loading');

    btnText.hidden = true;
    btnLoading.hidden = false;
    searchBtn.disabled = true;

    try {
      const ingredientList = [...ingredients].join(', ');
      const response = await fetch(`${WORKER_URL}${apiEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: ingredientList }),
      });

      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      displayResults(data.recipes || []);
    } catch (error) {
      console.error('Ingredient search error:', error);
      // Show fallback results for demo
      displayFallbackResults();
    } finally {
      btnText.hidden = false;
      btnLoading.hidden = true;
      searchBtn.disabled = false;
    }
  });

  // Display results
  function displayResults(recipes) {
    resultsGrid.innerHTML = '';

    if (recipes.length === 0) {
      resultsGrid.innerHTML = `
        <div class="no-results">
          <p>No exact matches found. Try different ingredients or we can create a custom recipe for you!</p>
          <button class="generate-recipe-btn">Generate Custom Recipe</button>
        </div>
      `;
      resultsSection.hidden = false;
      return;
    }

    recipes.forEach((recipe) => {
      const card = document.createElement('div');
      card.className = 'result-card';

      // Build missing ingredients HTML
      let missingHtml = '';
      if (recipe.missingIngredients && recipe.missingIngredients.length > 0) {
        missingHtml = `
          <div class="result-card-missing">
            <span class="missing-label">You might need:</span>
            ${recipe.missingIngredients.map((ing) => `<span class="missing-item">${ing}</span>`).join('')}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="result-card-body">
          <div class="result-card-header">
            <h4>${recipe.title}</h4>
            <span class="match-badge">${recipe.matchPercent || 100}%</span>
          </div>
          ${recipe.description ? `<p class="result-card-description">${recipe.description}</p>` : ''}
          <div class="result-card-meta">
            <span class="difficulty">${recipe.difficulty || 'Easy'}</span>
            <span class="time">${recipe.time || '10 min'}</span>
          </div>
          ${missingHtml}
        </div>
      `;
      resultsGrid.appendChild(card);
    });

    resultsSection.hidden = false;
  }

  // Fallback results for demo/offline
  function displayFallbackResults() {
    const ingredientList = [...ingredients];
    const fallbackRecipes = [
      {
        title: `${ingredientList[0] || 'Green'} Power Smoothie`,
        difficulty: 'Easy',
        time: '5 min',
        matchPercent: 85,
        image: '',
      },
      {
        title: 'Morning Energy Blend',
        difficulty: 'Easy',
        time: '5 min',
        matchPercent: 70,
        image: '',
      },
    ];
    displayResults(fallbackRecipes);
  }

  // Clear results
  clearBtn.addEventListener('click', () => {
    resultsSection.hidden = true;
    resultsGrid.innerHTML = '';
  });
}
