/**
 * Product Hero Block
 *
 * Split hero with product details on left, product image on right.
 * Gray background matching vitamix.com product pages.
 *
 * Content Model (DA table):
 * | Product Hero |
 * |--------------|
 * | Ascent Series |
 * | A3500i |
 * | [product-image.png] |
 * | Brushed Stainless |
 * | #888888 |
 * | /find-locally |
 * | /compare |
 */
export default function decorate(block) {
  const rows = [...block.children];

  // Parse content
  const series = rows[0]?.textContent?.trim() || '';
  const productName = rows[1]?.textContent?.trim() || '';
  const imageEl = rows[2]?.querySelector('picture') || rows[2]?.querySelector('img');
  const colorName = rows[3]?.textContent?.trim() || '';

  // Collect colors (rows 4+ until we hit URLs)
  const colors = [];
  let findLocallyUrl = '/find-locally';
  let compareUrl = '/compare';

  for (let i = 4; i < rows.length; i++) {
    const text = rows[i]?.textContent?.trim() || '';
    if (text.startsWith('#') && text.length === 7) {
      colors.push(text);
    } else if (text.startsWith('/') || text.startsWith('http')) {
      if (!findLocallyUrl || findLocallyUrl === '/find-locally') {
        findLocallyUrl = text;
      } else {
        compareUrl = text;
      }
    }
  }

  if (colors.length === 0) colors.push('#888888');

  // Build new structure
  block.innerHTML = '';

  // Left side - product details
  const detailsDiv = document.createElement('div');
  detailsDiv.className = 'product-hero-details';

  if (series) {
    const seriesEl = document.createElement('p');
    seriesEl.className = 'product-hero-series';
    seriesEl.textContent = series;
    detailsDiv.appendChild(seriesEl);
  }

  const nameEl = document.createElement('h1');
  nameEl.className = 'product-hero-name';
  nameEl.textContent = productName;
  detailsDiv.appendChild(nameEl);

  // Color swatches
  const swatchContainer = document.createElement('div');
  swatchContainer.className = 'product-hero-swatches';
  swatchContainer.innerHTML = \`<span class="product-hero-swatch-label">Swatch Color <strong>\${colorName}</strong></span>\`;

  const swatchRow = document.createElement('div');
  swatchRow.className = 'product-hero-swatch-row';
  colors.forEach((color, i) => {
    const swatch = document.createElement('button');
    swatch.className = \`product-hero-swatch\${i === 0 ? ' active' : ''}\`;
    swatch.style.backgroundColor = color;
    swatchRow.appendChild(swatch);
  });
  swatchContainer.appendChild(swatchRow);
  detailsDiv.appendChild(swatchContainer);

  // Buttons
  const findBtn = document.createElement('a');
  findBtn.className = 'button primary product-hero-find';
  findBtn.href = findLocallyUrl;
  findBtn.textContent = 'Find Locally';
  detailsDiv.appendChild(findBtn);

  const compareRow = document.createElement('div');
  compareRow.className = 'product-hero-compare-row';
  compareRow.innerHTML = \`
    <a class="button secondary product-hero-compare" href="\${compareUrl}">Compare</a>
    <a class="product-hero-compare-list" href="\${compareUrl}#list">View Comparison List.</a>
  \`;
  detailsDiv.appendChild(compareRow);

  // Right side - image
  const imageDiv = document.createElement('div');
  imageDiv.className = 'product-hero-image';
  if (imageEl) imageDiv.appendChild(imageEl.cloneNode(true));

  block.appendChild(detailsDiv);
  block.appendChild(imageDiv);
}
