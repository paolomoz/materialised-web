/**
 * Countdown Timer Block
 *
 * Displays a countdown timer with days, hours, minutes, seconds.
 * The HTML structure from orchestrator:
 * <div class="countdown-timer">
 *   <div><h2>Title</h2></div>
 *   <div><p>Subtitle</p></div>
 *   <div class="countdown-display">
 *     <div>00Days</div>
 *     <div>00Hours</div>
 *     <div>00Minutes</div>
 *     <div>00Seconds</div>
 *   </div>
 * </div>
 */

export default function decorate(block) {
  // Find the countdown display container
  const rows = [...block.children];

  // Add semantic classes
  if (rows[0]) rows[0].classList.add('countdown-timer-title');
  if (rows[1]) rows[1].classList.add('countdown-timer-subtitle');
  if (rows[2]) rows[2].classList.add('countdown-timer-display');

  // Parse and enhance countdown units
  const displayRow = block.querySelector('.countdown-timer-display');
  if (displayRow) {
    const units = [...displayRow.children];
    units.forEach((unit) => {
      const text = unit.textContent;
      const match = text.match(/(\d+)(\w+)/);
      if (match) {
        const [, value, label] = match;
        unit.innerHTML = `<span class="countdown-value">${value}</span><span class="countdown-label">${label}</span>`;
        unit.classList.add('countdown-unit');
      }
    });
  }
}
