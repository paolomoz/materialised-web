/**
 * CTA Block
 *
 * Call-to-action block with headline, optional text, and button.
 */

export default function decorate(block) {
  // Find the primary CTA button
  const button = block.querySelector('.button');

  if (button) {
    // Ensure button has primary class
    if (!button.classList.contains('primary') && !button.classList.contains('secondary')) {
      button.classList.add('primary');
    }
  }

  // Handle generative CTAs
  if (block.classList.contains('generative-cta')) {
    const link = block.querySelector('a[data-generation-hint]');
    if (link) {
      // Could add click tracking or prefetch logic here
      link.addEventListener('click', () => {
        // Track generative navigation
        if (window.hlx?.rum) {
          window.hlx.rum.sampleRUM('click', { source: 'generative-cta', target: link.href });
        }
      });
    }
  }
}
