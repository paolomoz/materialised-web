/**
 * Text Block
 *
 * Simple text content block with headline and body paragraphs.
 */

export default function decorate(block) {
  // The text block comes pre-formatted from generation
  // Just ensure proper structure
  const h2 = block.querySelector('h2');
  const paragraphs = block.querySelectorAll('p');

  // Add semantic structure if needed
  if (h2) {
    h2.classList.add('text-headline');
  }

  paragraphs.forEach((p) => {
    p.classList.add('text-body');
  });
}
