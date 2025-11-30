/**
 * Quick View Modal Block
 *
 * Recipe preview overlay triggered by recipe-grid card clicks.
 * Displays recipe details, ingredients, steps, and actions.
 *
 * Content Model (DA Table):
 * | Quick View Modal |
 * |------------------|
 * | enabled          |
 *
 * This block is a container that listens for recipe-quick-view events.
 */

export default function decorate(block) {
  // Create modal structure
  const modal = document.createElement('div');
  modal.className = 'quick-view-overlay';
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  modal.innerHTML = `
    <div class="quick-view-backdrop"></div>
    <div class="quick-view-container">
      <button class="quick-view-close" aria-label="Close modal">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="quick-view-content">
        <div class="quick-view-image">
          <img src="" alt="" loading="lazy">
        </div>
        <div class="quick-view-details">
          <h2 class="quick-view-title"></h2>
          <div class="quick-view-meta">
            <span class="meta-difficulty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <span class="difficulty-text"></span>
            </span>
            <span class="meta-time">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span class="time-text"></span>
            </span>
            <span class="meta-calories">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
              </svg>
              <span class="calories-text"></span>
            </span>
          </div>

          <div class="quick-view-section quick-view-ingredients">
            <h3>Ingredients</h3>
            <ul class="ingredients-list"></ul>
          </div>

          <div class="quick-view-section quick-view-steps">
            <h3>Quick Steps</h3>
            <ol class="steps-list"></ol>
          </div>

          <div class="quick-view-actions">
            <button class="action-btn action-favorite">
              <svg class="heart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              <span class="favorite-text">Save Recipe</span>
            </button>
            <a href="#" class="action-btn action-view-full">
              View Full Recipe
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  `;

  block.textContent = '';
  block.appendChild(modal);

  // Cache DOM elements
  const overlay = modal;
  const backdrop = modal.querySelector('.quick-view-backdrop');
  const closeBtn = modal.querySelector('.quick-view-close');
  const container = modal.querySelector('.quick-view-container');
  const imageEl = modal.querySelector('.quick-view-image img');
  const titleEl = modal.querySelector('.quick-view-title');
  const difficultyEl = modal.querySelector('.difficulty-text');
  const timeEl = modal.querySelector('.time-text');
  const caloriesEl = modal.querySelector('.calories-text');
  const ingredientsList = modal.querySelector('.ingredients-list');
  const stepsList = modal.querySelector('.steps-list');
  const favoriteBtn = modal.querySelector('.action-favorite');
  const favoriteText = modal.querySelector('.favorite-text');
  const viewFullLink = modal.querySelector('.action-view-full');
  const heartIcon = favoriteBtn.querySelector('.heart-icon');

  const STORAGE_KEY = 'vitamix-favorites';
  let currentRecipeId = null;

  // Get favorites from localStorage
  function getFavorites() {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  }

  // Save favorites to localStorage
  function saveFavorites(favorites) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  }

  // Update favorite button state
  function updateFavoriteState(isFavorite) {
    if (isFavorite) {
      favoriteBtn.classList.add('active');
      heartIcon.setAttribute('fill', 'currentColor');
      favoriteText.textContent = 'Saved';
    } else {
      favoriteBtn.classList.remove('active');
      heartIcon.setAttribute('fill', 'none');
      favoriteText.textContent = 'Save Recipe';
    }
  }

  // Open modal with recipe data
  function openModal(recipe) {
    currentRecipeId = recipe.id;

    // Populate content
    imageEl.src = recipe.image || '';
    imageEl.alt = recipe.title || '';
    titleEl.textContent = recipe.title || '';
    difficultyEl.textContent = recipe.difficulty || 'Easy';
    timeEl.textContent = recipe.time || '10 min';
    caloriesEl.textContent = `${recipe.calories || 150} cal`;

    // Ingredients
    ingredientsList.innerHTML = '';
    const ingredients = recipe.ingredients || [];
    ingredients.forEach((ing) => {
      const li = document.createElement('li');
      li.textContent = ing;
      ingredientsList.appendChild(li);
    });

    // Steps
    stepsList.innerHTML = '';
    const steps = recipe.steps || [];
    steps.forEach((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      stepsList.appendChild(li);
    });

    // View full link
    viewFullLink.href = recipe.link || '#';

    // Favorite state
    const favorites = getFavorites();
    updateFavoriteState(favorites.has(recipe.id));

    // Show modal
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus trap - focus close button
    setTimeout(() => closeBtn.focus(), 100);
  }

  // Close modal
  function closeModal() {
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    currentRecipeId = null;
  }

  // Event listeners
  backdrop.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);

  // Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.getAttribute('aria-hidden') === 'false') {
      closeModal();
    }
  });

  // Favorite toggle
  favoriteBtn.addEventListener('click', () => {
    if (!currentRecipeId) return;

    const favorites = getFavorites();
    const isNowFavorite = !favorites.has(currentRecipeId);

    if (isNowFavorite) {
      favorites.add(currentRecipeId);
    } else {
      favorites.delete(currentRecipeId);
    }

    saveFavorites(favorites);
    updateFavoriteState(isNowFavorite);

    // Update the grid card too
    const card = document.querySelector(`[data-recipe-id="${currentRecipeId}"]`);
    if (card) {
      const cardFavBtn = card.querySelector('.favorite-btn');
      const cardHeart = cardFavBtn?.querySelector('.heart-icon');
      if (cardFavBtn && cardHeart) {
        if (isNowFavorite) {
          cardFavBtn.classList.add('active');
          cardHeart.setAttribute('fill', 'currentColor');
        } else {
          cardFavBtn.classList.remove('active');
          cardHeart.setAttribute('fill', 'none');
        }
      }
    }
  });

  // Prevent body scroll on container scroll
  container.addEventListener('wheel', (e) => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    const delta = e.deltaY;

    if (delta < 0 && scrollTop === 0) {
      e.preventDefault();
    } else if (delta > 0 && scrollTop + clientHeight >= scrollHeight) {
      e.preventDefault();
    }
  }, { passive: false });

  // Listen for quick view events from recipe-grid
  document.addEventListener('recipe-quick-view', (e) => {
    openModal(e.detail);
  });
}
