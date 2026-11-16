# Surface: explorer (web/)

Mode: **Operate**. The whole site is one working surface: a persistent filter
panel plus three views (Words, Trends, Grades). Full functional spec:
`docs/PLAN.md`. Layout source: the team's sheet (`sheetfinal.pdf`).

## Direction contract

THESIS: A statistical yearbook you can steer. Every chart is a yearbook plate:
a figure title, a unit line, the chart, and a source/caveat line. Each plate
flips into its ruled table. This refuses the category default of a grey
dashboard of floating rounded cards.

OWN-WORLD: The two-colour print of the Czech Statistical Yearbook. Warm paper
ground, near-black ink and one petrol-blue second colour. Petrol is reserved
for the current selection and the active state only. Hairline rules instead
of boxes, tabular numerals everywhere, and Source Sans 3 as the single family.
Data colours sit on top of this palette, are safe for colour-blind readers,
and always carry meaning.

STORY: The visitor narrows the theses (faculty, years, language, AI
declaration) and reads what changed after Nov 2022 at three grains: words,
style trends and grades. Every number can be traced to its table.

FIRST VIEWPORT: A petrol header band holds the title, the view tabs (Words ·
Trends · Grades) and the CS/EN switch. Below it, on the left, is a 264 px
paper-tinted filter column with a live count. The work area is on the right.
The default view is Words: the word cloud plate fills the top, and the detail
plate below starts with an empty-state prompt.

FORM: candidate 6 of 7 (Statistical yearbook), seed:e015fa7997a25ca3.
Raises:
- From the airport sign system: one colour, one meaning. Petrol means
  "selected/active" and nothing else.
- From the ticket wallet: nothing disappears. Data that the filters exclude or
  a brush deselects stays as faint context rather than vanishing.
- From the star atlas: magnitude ramp. Word size uses a fixed 5-step ramp
  shown in the legend.
- From Ikeda: hairline precision. 1 px rules and pixel-crisp axes.

Signature move: the yearbook plate (title / unit / source rules) with a
"Table" toggle that turns the figure into its ruled yearbook table.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
