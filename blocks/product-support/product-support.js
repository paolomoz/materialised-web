/**
 * Product Support Block
 *
 * "Have a question?" section with FAQ and Contact links.
 *
 * Content Model (DA table):
 * | Product Support |
 * |-----------------|
 * | Have a question? |
 * | Frequently Asked Questions | /faq |
 * | Contact us | /contact |
 */
export default function decorate(block) {
  const rows = [...block.children];
  
  const title = rows[0]?.textContent?.trim() || 'Have a question?';
  const links = [];
  
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]?.children;
    const text = cells?.[0]?.textContent?.trim();
    const url = cells?.[1]?.textContent?.trim() || cells?.[0]?.querySelector('a')?.href || '#';
    if (text) links.push({ text, url });
  }
  
  block.innerHTML = \`
    <div class="product-support-inner">
      <h3 class="product-support-title">\${title}</h3>
      <div class="product-support-links">
        \${links.map(link => \`
          <a href="\${link.url}" class="product-support-link">\${link.text}</a>
        \`).join('<span class="product-support-divider"></span>')}
      </div>
    </div>
  \`;
}
