/**
 * Testimonials Block
 *
 * Displays customer testimonials with avatar, quote, author, and product.
 * HTML structure from orchestrator:
 * <div class="testimonials">
 *   <div><h2>Section title</h2></div>
 *   <div class="testimonials-grid">
 *     <div class="testimonial-card">
 *       <div><img alt="Name" /></div>
 *       <div>
 *         <p>★★★★★</p>
 *         <p>"Quote"</p>
 *         <p><strong>Name</strong>, Location</p>
 *         <p>Purchased: Product</p>
 *       </div>
 *     </div>
 *     ...
 *   </div>
 * </div>
 */

export default function decorate(block) {
  const rows = [...block.children];

  // First row is the title
  if (rows[0]) {
    rows[0].classList.add('testimonials-header');
  }

  // Remaining rows are testimonial cards
  rows.slice(1).forEach((row) => {
    row.classList.add('testimonial-card');

    const cells = [...row.children];
    if (cells[0]) {
      cells[0].classList.add('testimonial-avatar');
    }
    if (cells[1]) {
      cells[1].classList.add('testimonial-content');

      // Add classes to content elements
      const paragraphs = cells[1].querySelectorAll('p');
      paragraphs.forEach((p, index) => {
        if (index === 0 && p.textContent.includes('★')) {
          p.classList.add('testimonial-rating');
        } else if (index === 1) {
          p.classList.add('testimonial-quote');
        } else if (p.querySelector('strong')) {
          p.classList.add('testimonial-author');
        } else if (p.textContent.toLowerCase().includes('purchased')) {
          p.classList.add('testimonial-product');
        }
      });
    }
  });
}
