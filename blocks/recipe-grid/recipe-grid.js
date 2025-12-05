/**
 * Recipe Grid Block
 *
 * Filterable grid of recipe cards with favorites toggle and quick view modal.
 * Listens to recipe-filter-bar events for filtering.
 * Stores favorites in localStorage.
 *
 * Content Model (DA Table):
 * | Recipe Grid                    |                       |                       |
 * |--------------------------------|-----------------------|-----------------------|
 * | [smoothie.jpg]                 | [soup.jpg]            | [bowl.jpg]            |
 * | **Green Power Smoothie**       | **Tomato Basil Soup** | **Acai Bowl**         |
 * | Easy • 5 min                   | Medium • 20 min       | Easy • 10 min         |
 * | 1                              | 3                     | 2                     |
 * | banana,spinach,milk            | tomato,basil,garlic   | acai,banana,berries   |
 * | /recipes/green-smoothie        | /recipes/tomato-soup  | /recipes/acai-bowl    |
 *
 * Row structure: images, titles, meta (difficulty • time), difficulty level (1-5), ingredients, links
 */

const STORAGE_KEY = 'vitamix-favorites';

export default function decorate(block) {
  const rows = [...block.children];
  const recipes = [];

  // Parse recipe data from table structure (columns = recipes)
  // First, find how many columns we have
  const firstRow = rows[0];
  if (!firstRow) return;

  const columnCount = firstRow.children.length;

  // Initialize recipe objects
  for (let i = 0; i < columnCount; i += 1) {
    recipes.push({
      id: `recipe-${i}`,
      imgElement: null, // Store original img element for reuse
      image: '',
      title: '',
      difficulty: 'Easy',
      difficultyLevel: 1,
      time: '10 min',
      ingredients: [],
      link: '',
      calories: Math.floor(Math.random() * 200) + 100, // Demo data
      steps: [
        'Add liquid to container first',
        'Add soft ingredients',
        'Top with frozen items',
        'Blend on high for 60 seconds',
      ],
    });
  }

  // Parse each row
  rows.forEach((row, rowIndex) => {
    const cells = [...row.children];
    cells.forEach((cell, colIndex) => {
      if (colIndex >= columnCount) return;

      const recipe = recipes[colIndex];
      const picture = cell.querySelector('picture');
      const strong = cell.querySelector('strong');
      const link = cell.querySelector('a');
      const text = cell.textContent.trim();

      if (picture) {
        const img = picture.querySelector('img');
        // Store original img element for reuse (preserves data-gen-image for SSE updates)
        recipe.imgElement = img;
        recipe.image = img?.src || '';
        recipe.imageAlt = img?.alt || recipe.title;
      } else if (strong) {
        recipe.title = strong.textContent;
      } else if (text.includes('•')) {
        // Meta: "Easy • 5 min"
        const parts = text.split('•').map((p) => p.trim());
        if (parts[0]) recipe.difficulty = parts[0];
        if (parts[1]) recipe.time = parts[1];
      } else if (/^[1-5]$/.test(text)) {
        // Difficulty level 1-5
        recipe.difficultyLevel = parseInt(text, 10);
      } else if (text.includes(',')) {
        // Ingredients list
        recipe.ingredients = text.split(',').map((i) => i.trim());
      } else if (link) {
        recipe.link = link.href;
      } else if (text.startsWith('/')) {
        recipe.link = text;
      }
    });
  });

  // Load favorites from localStorage
  const favorites = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));

  // Build grid
  const container = document.createElement('div');
  container.className = 'recipe-grid-container';

  const grid = document.createElement('div');
  grid.className = 'recipe-grid-items';

  recipes.forEach((recipe) => {
    if (!recipe.title) return;

    const card = document.createElement('article');
    card.className = 'recipe-grid-card';
    card.dataset.difficulty = recipe.difficultyLevel;
    card.dataset.time = parseInt(recipe.time, 10) || 10;
    card.dataset.recipeId = recipe.id;

    const isFavorite = favorites.has(recipe.id);

    // Build card structure - reuse original img element to preserve data-gen-image for SSE updates
    const imageDiv = document.createElement('div');
    imageDiv.className = 'recipe-card-image';

    // Reuse original img element if available (preserves data-gen-image attribute)
    if (recipe.imgElement) {
      recipe.imgElement.loading = 'lazy';
      imageDiv.appendChild(recipe.imgElement);
    } else if (recipe.image) {
      const img = document.createElement('img');
      img.src = recipe.image;
      img.alt = recipe.title;
      img.loading = 'lazy';
      imageDiv.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'image-placeholder';
      imageDiv.appendChild(placeholder);
    }

    // Add favorite button
    const favBtn = document.createElement('button');
    favBtn.className = `favorite-btn ${isFavorite ? 'active' : ''}`;
    favBtn.setAttribute('aria-label', 'Save to favorites');
    favBtn.innerHTML = `
      <svg class="heart-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    `;
    imageDiv.appendChild(favBtn);

    // Build card body
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'recipe-card-body';
    bodyDiv.innerHTML = `
      <h3 class="recipe-card-title">${recipe.title}</h3>
      <div class="recipe-card-meta">
        <span class="meta-difficulty" data-level="${recipe.difficultyLevel}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          ${recipe.difficulty}
        </span>
        <span class="meta-time">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          ${recipe.time}
        </span>
      </div>
    `;

    card.appendChild(imageDiv);
    card.appendChild(bodyDiv);

    // Store full recipe data for modal
    card.recipeData = {
      ...recipe,
      isFavorite,
    };

    // Favorite toggle
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isNowFavorite = !favorites.has(recipe.id);

      if (isNowFavorite) {
        favorites.add(recipe.id);
        favBtn.classList.add('active');
      } else {
        favorites.delete(recipe.id);
        favBtn.classList.remove('active');
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
      card.recipeData.isFavorite = isNowFavorite;
    });

    // Card click - open modal
    card.addEventListener('click', (e) => {
      if (e.target.closest('.favorite-btn')) return;

      const event = new CustomEvent('recipe-quick-view', {
        bubbles: true,
        detail: card.recipeData,
      });
      document.dispatchEvent(event);
    });

    grid.appendChild(card);
  });

  container.appendChild(grid);

  // Empty state
  const emptyState = document.createElement('div');
  emptyState.className = 'recipe-grid-empty';
  emptyState.hidden = true;
  emptyState.innerHTML = `
    <p>No recipes match your filters.</p>
    <button class="clear-filters-btn">Clear filters</button>
  `;
  container.appendChild(emptyState);

  block.textContent = '';
  block.appendChild(container);

  // Filter logic
  function applyFilters(filters) {
    const cards = grid.querySelectorAll('.recipe-grid-card');
    let visibleCount = 0;

    cards.forEach((card) => {
      const cardDifficulty = parseInt(card.dataset.difficulty, 10);
      const cardTime = parseInt(card.dataset.time, 10);

      let visible = true;

      // Difficulty filter
      if (filters.maxDifficulty && cardDifficulty > filters.maxDifficulty) {
        visible = false;
      }

      // Time filter
      if (filters.maxTime !== 'all') {
        const maxTime = parseInt(filters.maxTime, 10);
        if (filters.maxTime === '30') {
          // 30+ means show only 30 and above
          if (cardTime < 30) visible = false;
        } else if (cardTime > maxTime) {
          visible = false;
        }
      }

      card.style.display = visible ? '' : 'none';
      if (visible) visibleCount += 1;
    });

    // Show/hide empty state
    emptyState.hidden = visibleCount > 0;
    grid.style.display = visibleCount > 0 ? '' : 'none';

    // Emit count update
    document.dispatchEvent(new CustomEvent('recipe-count-update', {
      detail: { count: visibleCount },
    }));
  }

  // Listen for filter changes
  document.addEventListener('recipe-filter-change', (e) => {
    applyFilters(e.detail);
  });

  // Clear filters button
  emptyState.querySelector('.clear-filters-btn').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('recipe-filter-reset', { bubbles: true }));
  });

  // Initial count
  setTimeout(() => {
    document.dispatchEvent(new CustomEvent('recipe-count-update', {
      detail: { count: recipes.filter((r) => r.title).length },
    }));
  }, 100);
}
