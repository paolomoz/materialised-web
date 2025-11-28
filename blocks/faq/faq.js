/**
 * FAQ Block
 *
 * Accordion-style FAQ with expandable questions and answers.
 *
 * == DA/EDS Table Structure ==
 * Authored as a table with "FAQ" header row:
 *
 * | FAQ                                           |                                      |
 * |-----------------------------------------------|--------------------------------------|
 * | Question 1 text?                              | Answer 1 text goes here              |
 * |-----------------------------------------------|--------------------------------------|
 * | Question 2 text?                              | Answer 2 text goes here              |
 *
 * Each row = one Q&A pair. Cell 1 = question, Cell 2 = answer.
 *
 * HTML structure after EDS processing:
 * <div class="faq">
 *   <div>                                     <!-- Q&A row -->
 *     <div>Question text?</div>               <!-- question cell -->
 *     <div>Answer text</div>                  <!-- answer cell -->
 *   </div>
 *   <div>
 *     <div>Question 2?</div>
 *     <div>Answer 2</div>
 *   </div>
 * </div>
 *
 * The decorator adds accessibility attributes and click handlers.
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
}
