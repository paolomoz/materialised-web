/**
 * Product Compare Block
 *
 * Displays selectable product cards with a "Compare" button
 * that opens an overlay modal with side-by-side comparison.
 */

// Store selected products globally
const selectedProducts = new Map();

function createCheckIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3');
  svg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
  return svg;
}

function createCloseIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.innerHTML = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';
  return svg;
}

function createFeatureCheckIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', '#4a7c59');
  svg.setAttribute('stroke-width', '2');
  svg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
  return svg;
}

function parseProductData(row) {
  const cells = row.querySelectorAll(':scope > div');
  if (cells.length < 2) return null;

  // First cell: image
  const imageCell = cells[0];
  const img = imageCell.querySelector('img');

  // Second cell: product details
  const detailsCell = cells[1];
  const name = detailsCell.querySelector('h3, strong')?.textContent || '';
  const paragraphs = detailsCell.querySelectorAll('p');

  // Extract features from list or paragraphs
  const features = [];
  const featureList = detailsCell.querySelector('ul');
  if (featureList) {
    featureList.querySelectorAll('li').forEach((li) => {
      features.push(li.textContent.trim());
    });
  }

  // Extract price, status, link
  let price = '';
  let status = 'available';
  let link = '';
  let colors = [];

  paragraphs.forEach((p) => {
    const text = p.textContent.trim();
    if (text.startsWith('$')) {
      price = text;
    } else if (text.toLowerCase().includes('out of stock')) {
      status = 'out-of-stock';
    } else if (text.toLowerCase().includes('colors:')) {
      colors = text.replace(/colors:/i, '').split(',').map((c) => c.trim());
    }
    const anchor = p.querySelector('a');
    if (anchor) {
      link = anchor.href;
    }
  });

  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    image: img?.src || '',
    imageAlt: img?.alt || name,
    price,
    status,
    link,
    features,
    colors,
  };
}

function createProductCard(product, index) {
  const card = document.createElement('div');
  card.className = 'product-compare-card';
  card.dataset.productId = product.id;

  const checkbox = document.createElement('div');
  checkbox.className = 'product-compare-checkbox';
  checkbox.appendChild(createCheckIcon());

  const imageWrapper = document.createElement('div');
  imageWrapper.className = 'product-compare-image';
  if (product.image) {
    const img = document.createElement('img');
    img.src = product.image;
    img.alt = product.imageAlt;
    img.loading = 'lazy';
    imageWrapper.appendChild(img);
  }

  const name = document.createElement('h3');
  name.className = 'product-compare-name';
  name.textContent = product.name;

  const price = document.createElement('div');
  price.className = 'product-compare-price';
  price.textContent = product.price;

  card.appendChild(checkbox);
  card.appendChild(imageWrapper);
  card.appendChild(name);
  if (product.price) {
    card.appendChild(price);
  }

  // Click handler for selection
  card.addEventListener('click', () => {
    const isSelected = card.classList.toggle('selected');
    if (isSelected) {
      selectedProducts.set(product.id, product);
    } else {
      selectedProducts.delete(product.id);
    }
    updateCompareButton();
  });

  return card;
}

function updateCompareButton() {
  const btn = document.querySelector('.product-compare-btn');
  const count = selectedProducts.size;

  if (count >= 2) {
    btn.classList.add('active');
    btn.textContent = `Compare (${count})`;
  } else {
    btn.classList.remove('active');
    btn.textContent = 'Select 2+ products to compare';
  }
}

function getAllFeatures(products) {
  const featureSet = new Set();
  products.forEach((p) => {
    p.features.forEach((f) => featureSet.add(f));
  });
  return Array.from(featureSet);
}

function createComparisonModal(products) {
  const overlay = document.createElement('div');
  overlay.className = 'comparison-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'comparison-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'comparison-modal-header';

  const title = document.createElement('h2');
  title.textContent = 'Compare Products';

  const actions = document.createElement('div');
  actions.className = 'comparison-modal-actions';

  const printBtn = document.createElement('button');
  printBtn.className = 'comparison-modal-print';
  printBtn.textContent = 'Print Page';
  printBtn.addEventListener('click', () => window.print());

  const closeBtn = document.createElement('button');
  closeBtn.className = 'comparison-modal-close';
  closeBtn.appendChild(createCloseIcon());
  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
    document.body.style.overflow = '';
  });

  actions.appendChild(printBtn);
  actions.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(actions);

  // Products grid
  const productsGrid = document.createElement('div');
  productsGrid.className = 'comparison-modal-products';
  productsGrid.style.gridTemplateColumns = `200px repeat(${products.length}, 1fr)`;

  // Empty corner cell
  const corner = document.createElement('div');
  corner.className = 'comparison-modal-corner';
  productsGrid.appendChild(corner);

  // Product columns
  products.forEach((product) => {
    const col = document.createElement('div');
    col.className = 'comparison-modal-product';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'comparison-modal-remove';
    removeBtn.appendChild(createCloseIcon());
    removeBtn.addEventListener('click', () => {
      selectedProducts.delete(product.id);
      const card = document.querySelector(`.product-compare-card[data-product-id="${product.id}"]`);
      if (card) card.classList.remove('selected');
      updateCompareButton();

      if (selectedProducts.size < 2) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
        document.body.style.overflow = '';
      } else {
        // Rebuild modal with remaining products
        overlay.remove();
        openComparisonModal();
      }
    });

    const img = document.createElement('div');
    img.className = 'comparison-modal-product-image';
    if (product.image) {
      const imgEl = document.createElement('img');
      imgEl.src = product.image;
      imgEl.alt = product.imageAlt;
      img.appendChild(imgEl);
    }

    // Color swatches
    const colors = document.createElement('div');
    colors.className = 'comparison-modal-colors';
    if (product.colors && product.colors.length > 0) {
      product.colors.forEach((color, i) => {
        const swatch = document.createElement('span');
        swatch.className = 'comparison-modal-swatch';
        swatch.style.backgroundColor = color;
        if (i === 0) swatch.classList.add('active');
        colors.appendChild(swatch);
      });
    }

    const name = document.createElement('h3');
    name.className = 'comparison-modal-product-name';
    name.textContent = product.name;

    const cta = document.createElement('div');
    cta.className = 'comparison-modal-cta';
    if (product.status === 'out-of-stock') {
      const outOfStock = document.createElement('span');
      outOfStock.className = 'comparison-modal-out-of-stock';
      outOfStock.textContent = 'Out of stock';
      cta.appendChild(outOfStock);
    } else {
      const btn = document.createElement('a');
      btn.href = product.link || '#';
      btn.className = 'comparison-modal-view-btn';
      btn.textContent = 'VIEW DETAILS';
      cta.appendChild(btn);
    }

    col.appendChild(removeBtn);
    col.appendChild(img);
    col.appendChild(colors);
    col.appendChild(name);
    col.appendChild(cta);
    productsGrid.appendChild(col);
  });

  // Features comparison
  const featuresSection = document.createElement('div');
  featuresSection.className = 'comparison-modal-features';
  featuresSection.style.gridTemplateColumns = `200px repeat(${products.length}, 1fr)`;

  const featuresLabel = document.createElement('div');
  featuresLabel.className = 'comparison-modal-features-label';
  featuresLabel.textContent = 'Features';
  featuresSection.appendChild(featuresLabel);

  // Feature values per product
  products.forEach((product) => {
    const featuresList = document.createElement('div');
    featuresList.className = 'comparison-modal-features-list';

    if (product.features && product.features.length > 0) {
      product.features.forEach((feature) => {
        const item = document.createElement('div');
        item.className = 'comparison-modal-feature-item';
        item.appendChild(createFeatureCheckIcon());
        const text = document.createElement('span');
        text.textContent = feature;
        item.appendChild(text);
        featuresList.appendChild(item);
      });
    } else {
      const na = document.createElement('span');
      na.className = 'comparison-modal-na';
      na.textContent = 'N/A';
      featuresList.appendChild(na);
    }

    featuresSection.appendChild(featuresList);
  });

  modal.appendChild(header);
  modal.appendChild(productsGrid);
  modal.appendChild(featuresSection);
  overlay.appendChild(modal);

  return overlay;
}

function openComparisonModal() {
  const products = Array.from(selectedProducts.values());
  if (products.length < 2) return;

  const modal = createComparisonModal(products);
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  // Trigger animation
  requestAnimationFrame(() => {
    modal.classList.add('open');
  });
}

export default function decorate(block) {
  const rows = [...block.children];
  const products = [];

  // Parse product data from rows
  rows.forEach((row, index) => {
    const product = parseProductData(row);
    if (product) {
      products.push(product);
    }
  });

  // Clear original content
  block.innerHTML = '';

  // Create header with title and compare button
  const header = document.createElement('div');
  header.className = 'product-compare-header';

  const title = document.createElement('h2');
  title.className = 'product-compare-title';
  title.textContent = 'Select Products to Compare';

  const compareBtn = document.createElement('button');
  compareBtn.className = 'product-compare-btn';
  compareBtn.textContent = 'Select 2+ products to compare';
  compareBtn.addEventListener('click', () => {
    if (selectedProducts.size >= 2) {
      openComparisonModal();
    }
  });

  header.appendChild(title);
  header.appendChild(compareBtn);

  // Create product grid
  const grid = document.createElement('div');
  grid.className = 'product-compare-grid';

  products.forEach((product, index) => {
    const card = createProductCard(product, index);
    grid.appendChild(card);
  });

  block.appendChild(header);
  block.appendChild(grid);
}
