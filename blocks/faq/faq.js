/**
 * FAQ Block
 *
 * Accordion-style FAQ with expandable questions and answers.
 */

export default function decorate(block) {
  const items = block.querySelectorAll(':scope > div');

  items.forEach((item, index) => {
    const question = item.querySelector(':scope > div:first-child');
    const answer = item.querySelector(':scope > div:last-child');

    if (question && answer) {
      // Set up accessibility attributes
      const questionId = `faq-question-${index}`;
      const answerId = `faq-answer-${index}`;

      question.setAttribute('role', 'button');
      question.setAttribute('aria-expanded', 'false');
      question.setAttribute('aria-controls', answerId);
      question.setAttribute('id', questionId);
      question.setAttribute('tabindex', '0');

      answer.setAttribute('role', 'region');
      answer.setAttribute('aria-labelledby', questionId);
      answer.setAttribute('id', answerId);

      // Toggle function
      const toggle = () => {
        const isExpanded = item.classList.contains('expanded');
        item.classList.toggle('expanded');
        question.setAttribute('aria-expanded', !isExpanded);
      };

      // Click handler
      question.addEventListener('click', toggle);

      // Keyboard handler
      question.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    }
  });

  // Optionally expand first item
  const firstItem = items[0];
  if (firstItem && !block.classList.contains('collapsed')) {
    // Keep all collapsed by default for generated content
  }
}
