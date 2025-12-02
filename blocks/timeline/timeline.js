/**
 * Timeline Block
 *
 * Displays a vertical timeline with year markers and events.
 * HTML structure from orchestrator:
 * <div class="timeline">
 *   <div><h2>Title</h2></div>
 *   <div class="timeline-events">
 *     <div class="timeline-event">
 *       <div><p><strong>1921</strong></p></div>
 *       <div>
 *         <p><strong>Event Title</strong></p>
 *         <p>Event description</p>
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
    rows[0].classList.add('timeline-header');
  }

  // Remaining rows are timeline events
  rows.slice(1).forEach((row) => {
    row.classList.add('timeline-event');

    const cells = [...row.children];
    if (cells[0]) {
      cells[0].classList.add('timeline-year');
    }
    if (cells[1]) {
      cells[1].classList.add('timeline-content');
    }
  });
}
