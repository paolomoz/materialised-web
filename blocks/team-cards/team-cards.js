/**
 * Team Cards Block
 *
 * Displays team member cards with photo, name, role, and bio.
 * HTML structure from orchestrator:
 * <div class="team-cards">
 *   <div><h2>Section title</h2></div>
 *   <div class="team-grid">
 *     <div class="team-member">
 *       <div><img alt="Name" /></div>
 *       <div>
 *         <p><strong>Name</strong></p>
 *         <p>Role</p>
 *         <p>Bio</p>
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
    rows[0].classList.add('team-cards-header');
  }

  // Create a grid container for team members
  const grid = document.createElement('div');
  grid.className = 'team-cards-grid';

  // Remaining rows are team member cards
  rows.slice(1).forEach((row) => {
    row.classList.add('team-member');

    const cells = [...row.children];
    if (cells[0]) {
      cells[0].classList.add('team-member-photo');
    }
    if (cells[1]) {
      cells[1].classList.add('team-member-info');

      // Add classes to info elements
      const paragraphs = cells[1].querySelectorAll('p');
      paragraphs.forEach((p, index) => {
        if (index === 0) p.classList.add('team-member-name');
        else if (index === 1) p.classList.add('team-member-role');
        else p.classList.add('team-member-bio');
      });
    }

    grid.appendChild(row);
  });

  // Append grid after header
  if (rows[0]) {
    block.appendChild(grid);
  }
}
