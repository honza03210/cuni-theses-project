# Critique ignore list

Decisions the team has made on purpose. Drop findings that only restate these; a finding about a
defect inside one of them (e.g. a bug in the zoom) still counts.

## Filters
- **AI-declaration filter stays the last filter group.** Moving it up or turning it into a view-level toggle
  was considered and declined (round 10).
- **Grade filter does not apply to Words.** A grade split would make the word cubes ~5× larger; the group is
  disabled there with its reason shown.
- **Faculty list shows all 15 faculties.** It is the real structure of the university; do not flag it as
  "more than 4 options".

## Simple version
- **Caveats, sources and long explanations stay hidden in Simple.** They live in Detailed ("Show details"),
  per the user's "really clean and really simple" brief (rounds 8–9).
- **Trends shows every selected faculty as an equal small multiple** (sorted by change). Showing only the top
  movers large was considered and declined.
- **No how-to text in Simple.** The "How to read this view" help stays Detailed-only.
- **Detailed-only extras:** the parallel plot, the faculty context lines, the counts in the filter panel.

## Zoom
- **Drag-zoom is off on touch.** Dragging on a phone must keep scrolling the page.
- **Zoom is visual only.** Answer lines and statistics keep the selected year filter on purpose;
  "Use as year filter" in the zoom bar is the bridge.

## Visual system (DESIGN.md)
- **Warm paper `#f6f4ee` (cream-palette detector rule) is the intended ground.**
- **Repeating-linear-gradient stripes** on legend keys and the grade-4 swatch are dash/hatch encodings
  required by the "never colour alone" rule, not decoration.
- **Compact masthead h1** in the petrol band is deliberately small; the hierarchy is carried by plate titles
  and answer lines.
- **The word cloud** is the chosen Words overview; do not propose replacing it with a table or bar chart.
