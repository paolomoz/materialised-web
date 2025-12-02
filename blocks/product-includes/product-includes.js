/**
 * Product Includes Block
 *
 * "What comes in the box" section.
 *
 * Content Model (DA table):
 * | Product Includes |
 * |------------------|
 * | What comes in the box |
 * | Motor Base |
 * | Low-Profile 2.0-litre Container |
 * | S2 Low-Profile Tamper |
 * | First Blends Booklet |
 */
export default function decorate(block) {
  const rows = [...block.children];
  
  const title = rows[0]?.textContent?.trim() || 'What comes in the box';
  const items = rows.slice(1).map(row => row.textContent?.trim()).filter(Boolean);
  
  block.innerHTML = \`
    <h3 class="product-includes-title">\${title}</h3>
    <ul class="product-includes-list">
      \${items.map(item => \`<li>\${item}</li>\`).join('')}
    </ul>
  \`;
}
