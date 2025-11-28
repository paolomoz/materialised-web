/**
 * Columns Block
 *
 * == DA/EDS Table Structure ==
 * Authored as a table with "Columns" header row:
 *
 * | Columns (highlight)       |                          |                          |
 * |---------------------------|--------------------------|--------------------------|
 * | **Column 1 Title**        | **Column 2 Title**       | **Column 3 Title**       |
 * | Column 1 text content     | Column 2 text content    | Column 3 text content    |
 * | goes here                 | goes here                | goes here                |
 *
 * Block options like "highlight" become CSS classes.
 * Each row represents a row in the layout.
 * Each cell in a row becomes a column.
 *
 * This converts to HTML after EDS processing:
 * <div class="columns highlight">
 *   <div>                                    <!-- row -->
 *     <div><h3>Title 1</h3><p>Text</p></div> <!-- column 1 -->
 *     <div><h3>Title 2</h3><p>Text</p></div> <!-- column 2 -->
 *     <div><h3>Title 3</h3><p>Text</p></div> <!-- column 3 -->
 *   </div>
 * </div>
 *
 * For text-only columns (no images), the content flows directly.
 * For columns with images:
 *
 * | Columns                   |                          |
 * |---------------------------|--------------------------|
 * | [image]                   | **Title**                |
 * |                           | Description text         |
 *
 * Results in:
 * <div class="columns">
 *   <div>
 *     <div><picture>...</picture></div>      <!-- image column -->
 *     <div><h3>Title</h3><p>Text</p></div>   <!-- text column -->
 *   </div>
 * </div>
 */

export default function decorate(block) {
  const cols = [...block.firstElementChild.children];
  block.classList.add(`columns-${cols.length}-cols`);

  // setup image columns
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          // picture is only content in column
          picWrapper.classList.add('columns-img-col');
        }
      }
    });
  });
}
