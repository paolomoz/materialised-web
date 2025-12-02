/**
 * Product Info Block
 *
 * Two-column layout: Features on left, Specs tabs on right.
 *
 * Content Model (DA table):
 * | Product Info |
 * |--------------|
 * | About |
 * | Features |
 * | Five program settings... (description) |
 * | Program Settings | Five program settings ensure... |
 * | Touch Interface | Touchscreen controls... |
 * | You're In Control | Variable Speed Control... |
 * | Self-Detect Technology | Wireless connectivity... |
 * | --- | (separator for specs section) |
 * | Series | Ascent |
 * | Dimensions | 20.32cm x 27.94cm x 43.18cm |
 * | HP | 2.3 |
 * | Electrical | 110-120V... |
 * | Weight | 8.3 kg |
 * | Cord | 4 ft |
 * | Use | Household |
 * | Manufacturer | Vitamix - Cleveland, Ohio USA |
 */
export default function decorate(block) {
  const rows = [...block.children];
  
  // Parse content
  const aboutTitle = rows[0]?.textContent?.trim() || 'About';
  const featuresTitle = rows[1]?.textContent?.trim() || 'Features';
  const featuresDesc = rows[2]?.textContent?.trim() || '';
  
  // Find separator (---) to split features from specs
  let separatorIndex = -1;
  const features = [];
  const specs = [];
  
  for (let i = 3; i < rows.length; i++) {
    const cells = rows[i]?.children;
    const firstCell = cells?.[0]?.textContent?.trim() || '';
    const secondCell = cells?.[1]?.textContent?.trim() || '';
    
    if (firstCell === '---' || firstCell === 'specs') {
      separatorIndex = i;
      continue;
    }
    
    if (separatorIndex === -1) {
      // Before separator = features
      if (firstCell && secondCell) {
        features.push({ title: firstCell, description: secondCell });
      }
    } else {
      // After separator = specs
      if (firstCell && secondCell) {
        specs.push({ label: firstCell, value: secondCell });
      }
    }
  }

  // Build structure
  block.innerHTML = '';
  
  // Left column - Features
  const featuresCol = document.createElement('div');
  featuresCol.className = 'product-info-features';
  
  featuresCol.innerHTML = \`
    <h2 class="product-info-about">\${aboutTitle}</h2>
    <h3 class="product-info-title">\${featuresTitle}</h3>
    <p class="product-info-desc">\${featuresDesc}</p>
    <div class="product-info-feature-list">
      \${features.map(f => \`
        <div class="product-info-feature">
          <h4>\${f.title}</h4>
          <p>\${f.description}</p>
        </div>
      \`).join('')}
    </div>
  \`;
  
  // Right column - Specs with tabs
  const specsCol = document.createElement('div');
  specsCol.className = 'product-info-specs';
  
  specsCol.innerHTML = \`
    <div class="product-info-tabs">
      <button class="product-info-tab active" data-tab="specs">SPECIFICATIONS</button>
      <button class="product-info-tab" data-tab="warranty">WARRANTY</button>
      <button class="product-info-tab" data-tab="resources">RESOURCES</button>
    </div>
    <div class="product-info-tab-content" data-content="specs">
      <h4>Product Specifications</h4>
      <dl class="product-info-spec-list">
        \${specs.map(s => \`
          <div class="product-info-spec-row">
            <dt>\${s.label}</dt>
            <dd>\${s.value}</dd>
          </div>
        \`).join('')}
      </dl>
    </div>
    <div class="product-info-tab-content" data-content="warranty" style="display:none">
      <h4>Warranty Information</h4>
      <p>Full 10-year warranty included with your Vitamix.</p>
    </div>
    <div class="product-info-tab-content" data-content="resources" style="display:none">
      <h4>Resources</h4>
      <p>Owner's manual and quick start guide available for download.</p>
    </div>
  \`;
  
  // Tab click handlers
  specsCol.querySelectorAll('.product-info-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      specsCol.querySelectorAll('.product-info-tab').forEach(t => t.classList.remove('active'));
      specsCol.querySelectorAll('.product-info-tab-content').forEach(c => c.style.display = 'none');
      tab.classList.add('active');
      specsCol.querySelector(\`[data-content="\${tab.dataset.tab}"]\`).style.display = 'block';
    });
  });
  
  block.appendChild(featuresCol);
  block.appendChild(specsCol);
}
