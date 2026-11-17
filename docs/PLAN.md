# Implementation plan — CUNI Bc. theses visualization

Interactive web explorer of the
[`cuni-bachelor-theses-style`](https://huggingface.co/datasets/honza03210/cuni-bachelor-theses-style)
dataset, following the layout sheet (`sheetfinal.pdf`): a persistent filter
panel on the left and three views — **Words**, **Trends**, **Grades**.

## 1. Decisions (confirmed)

| topic | decision |
|---|---|
| Stack | Svelte 5 + Vite + TypeScript, D3 (scales, shapes, axes, brush), `d3-cloud` for the word cloud, canvas for the parallel plot. Python + DuckDB pipeline precomputes the browser data. Static site, no server. |
| Devices | Desktop/laptop first (≥ 1280 px). Below ~1024 px the filter panel becomes a drawer and charts stack; phones work but are not designed for. |
| UI language | Czech + English, switch in the header. |
| Grades | Common 1–4 scale (`grade_points`): 1 Výborně / Excellent, 2 Velmi dobře / Very good, 3 Dobře / Good, 4 Neprospěl / Fail. A–F maps to it via the dataset's own equivalence (A/B→1, C/D→2, E→3, F→4). |
| Word "expectation" | Extrapolated linear trend: share of theses using the word, fitted on the 5 years before the target year, extrapolated to the target year. |
| Word target year | The last year of the selected year range. |
| AI-declaration filter | Narrows only 2023+ data (the only years that have it); earlier years stay unfiltered as a baseline. A marker at 2023 says so. Also applies to the Words view. |
| Trends average | Panels only for the selected faculties; grey lines and the average are computed from the selection (thesis-weighted). |
| Interactions | Click a year in the grade area chart → the bar chart shows that year; brush parallel-plot axes; hovering a faculty line highlights it in all panels; the whole state is in the URL (shareable). |
| Course | No hard requirements beyond the three views. |

## 2. Data rules applied everywhere

- Only `usable` theses; years **2006–2026** (pre-2006 has 181 theses and is
  dropped; the sketch's 2000 start becomes 2006). 2026 is incomplete: drawn
  dotted/faded and excluded from the **default** range (default 2006–2025).
- Style metrics (Trends, parallel plot) use only `body_method == "intro-back"`
  theses, as the dataset card recommends. Stated in each chart's footnote.
- Language filter default: `cs` only. If more than one language is selected in
  Trends or the parallel plot, show an inline warning ("style metrics are not
  comparable across languages").
- Faculty × year cells with fewer than **20 theses** are not drawn (gap in the
  line / faded bar with a "small sample" note).
- Word data comes from `word_counts`, which only stores words used **≥ 2× in a
  thesis**. So "share of theses using a word" means "using it at least twice".
  This is said in the Words footnote.

## 3. Data pipeline (`pipeline/`, Python + DuckDB)

`python pipeline/build.py` reads `data/*.parquet` (from
`scripts/download_data.py --all`) and writes `web/public/data/`. The output is
small and **committed**, so the site builds without the 600 MB source.

### 3.1 `theses.bin` + `theses.json` (≈ 2–3 MB gz)

One row per usable thesis, 2006–2026 (~65 k rows), columnar typed arrays:

| field | type | notes |
|---|---|---|
| `fac` | uint8 | index into faculty list in `theses.json` |
| `year` | uint8 | offset from 2006 |
| `lang` | uint8 | cs / en / sk / other |
| `ai` | uint8 | 0 = n/a (pre-2023 or no public text), 1 declared use, 2 declared no use, 3 template only, 4 no statement found |
| `grade` | uint8 | 1–4, 0 = missing |
| `clean` | uint8 | `body_method == "intro-back"` |
| metrics | float32 ×9 | `mean_word_len`, `mean_sentence_len`, `std_sentence_len`, `mattr`, `repeated_trigram_ratio`, `long_word_ratio`, `comma_per_1000w`, `em_dash_per_1000w`, `first_person_sg_per_1000w` (NaN where missing) |

`theses.json` holds faculty codes, Czech + English names (English names come
from a hand-written map of the 15 faculties), metric metadata (label cs/en,
unit, description, 1st/99th percentile for axis clamping) and the row count.
All Trends and Grades aggregation happens **in the browser** from this table,
so any filter combination works with no extra data.

### 3.2 Word cube — `words-<lang>.bin` + `words-<lang>.json`, lazy-loaded per language

- Join `word_counts` × theses on `item_id`. Count theses using each word per
  **cell**, where a cell is (faculty, year). For 2023–2026 the cell is also
  split by AI declaration (5 values). So 15 × 17 + 15 × 4 × 5 = **555 cells**.
- Vocabulary per language: the top **8,000 words** by number of theses
  using them in 2015–2026, and in ≥ 30 theses overall. Tune the cap against a
  size budget of **≤ 4 MB gz per language**. Only `cs` is guaranteed. `en`,
  `sk` and `other` ship a smaller vocabulary if their thesis counts make
  8,000 meaningless.
- Layout: dense `Uint16Array[word × cell]` + word list in JSON. The browser
  computes denominators (usable theses per cell and language) from
  `theses.bin`.

### 3.3 Pipeline checks (`pipeline/check.py`)

Assert row counts against the dataset card (66,138 theses before filtering),
that no grade falls outside 1–4, that every faculty × year sum in the word cube
is ≤ that cell's thesis count, and that file sizes stay within budget.

## 4. App architecture (`web/`)

```
web/src/
  lib/state/filters.svelte.ts   # filter + view state (runes), URL sync
  lib/state/url.ts              # encode/decode ?view=&fac=&y=&lang=&ai=&m=&w=&gy=&brush=
  lib/data/load.ts              # fetch + decode .bin files, cache per language
  lib/data/select.ts            # filter mask over theses (Uint8Array), counts
  lib/data/aggregate.ts         # weighted means per fac×year, grade shares
  lib/data/excess.ts            # trend fit + excess scores for words
  lib/i18n/{cs,en}.ts           # all strings; Intl number/percent formatting
  lib/ui/                       # Tabs, FilterPanel, RangeSlider, CheckList,
                                # Tooltip, Legend, ChartFrame (title, footnote,
                                # "show as table" toggle), SmallSampleNote
  views/words/   WordsView, WordCloud, WordDetail
  views/trends/  TrendsView, MetricPicker, TrendGrid, TrendPanel
  views/grades/  GradesView, GradeArea, GradeBars, ParallelPlot
```

- **State:** one filter store. Each view derives what it needs. The filter
  mask is recomputed once per filter change (65 k rows, < 5 ms).
- **URL state:** every control writes to the query string (replaceState).
  Loading a URL restores view, filters, metric, selected word, bar year and
  brushes.
- **Tests:** Vitest for `select`, `aggregate`, `excess` and `url`
  (round-trip), using small hand-made fixtures.

## 5. Shell and filter panel (always visible)

- **Header:** title "CUNI Bc. theses", CS/EN switch, tabs Words · Trends ·
  Grades (real tab semantics, arrow-key navigation).
- **Filter panel (left, ~260 px, scrolls independently):**
  - **Faculty**: checkbox list (abbreviation + full name on hover/focus),
    with All / None and the thesis count next to each faculty.
  - **Years**: dual-handle range 2006–2026, keyboard operable, 2026 marked
    "incomplete".
  - **Language**: cs / en / sk / other checkboxes.
  - **AI-use declaration**: declared use / declared no use / template only /
    no statement. Note: "applies to theses from 2023 on".
  - Live total: "N theses match". A **Reset** button.
- Controls the current view ignores are disabled, with a one-line reason.

## 6. Words view

Top: **word cloud**. Bottom: **detail chart** of the clicked word.

**Scoring** (in `excess.ts`, recomputed on every filter change):
1. For the selected faculties, languages and AI declarations, sum the word
   counts and the thesis counts per year → share `p_y`.
2. Target year `T` = end of the year range. Baseline = the 5 years `T-5 … T-1`,
   which must lie inside the data (≥ 2006). If `T < 2011`, the view says it
   needs a later end year.
3. Expected `ê_T` = least-squares line through the baseline, extrapolated to
   `T`, floored at a small ε.
4. Score = `log2((p_T + ε) / (ê_T + ε))`. Positive = used more than expected,
   negative = less.
5. **Min frequency** slider (as in the sketch): keep words whose `p_T` or `ê_T`
   is ≥ the threshold (default 1 % of theses). This cuts out noise from rare
   words.
6. Show the top 50 rising and top 50 falling words by |score|.

**Cloud:** font size ∝ |score|. Direction is shown by colour **and** style:
rising words are blue and bold, falling words are orange and regular (the
Okabe–Ito pair, safe for colour-blind readers). This replaces the sketch's
green/red, which is the pair red-green colour blindness can't tell apart. The
legend says "more than expected / less than expected". Layout uses `d3-cloud`
with a fixed random seed, so the same filters always give the same layout.
Every word is a focusable button. Its tooltip shows the observed share,
expected share and number of theses.

**Detail chart** (on click; the selected word is stored in the URL):
- Share of theses using the word, 2006–end of range.
- Thin grey line per selected faculty, thick line for the whole selection.
- Dashed baseline fit line extended to `T`. A hollow dot at the expected value
  and a filled dot at the observed one, joined by an arrow labelled with the
  difference (the sketch's arrow).
- Vertical marker at Nov 2022 ("ChatGPT").
- Empty state: "Click a word to see its trend."

## 7. Trends view

- **Metric picker** (right, as in the sketch): radio list with average word
  length, average sentence length, sentence-length spread (std), lexical
  diversity (MATTR), repetition (repeated trigrams), long-word share,
  em dashes /1000 words, commas /1000 words, 1st person sg. /1000 words. Each
  has a one-line explanation and its unit.
- **Small multiples:** one panel per selected faculty, in a grid sorted by
  faculty code (5 columns on wide screens). All panels share the y-scale so
  they can be compared.
  - Highlighted faculty: dark ink, 2 px solid. Its 95 % CI is a faint band.
  - Other selected faculties: light grey, 1 px.
  - Average of the selection (thesis-weighted): vermillion, 2 px, **dashed**.
    It's as heavy as the main line but distinct by both colour and dash.
  - Legend above the grid: ● this faculty · ● other faculties · ┅ average
    (as in the sketch).
  - Markers: Nov 2022 (ChatGPT), and 2023 "AI filter starts here" when the AI
    filter is active. 2026 point dotted.
- **Hover** a grey line → that faculty is highlighted in every panel, with a
  tooltip (faculty, year, value, n). Panels are keyboard-focusable; arrow keys
  move between years.
- With one faculty selected: a single large panel, with the university
  average added as a grey reference line.

## 8. Grades view

Layout as in the sketch: area chart top left, bar chart top right, parallel
plot along the bottom.

**Grade palette** (ordered, safe for colour-blind readers; ColorBrewer RdYlBu
4-class): 1 `#2c7bb6`, 2 `#abd9e9`, 3 `#fdae61`, 4 `#d7191c`. Bands are
labelled directly on the chart, not only in a legend. Grade 4 also gets a
subtle hatch, so the fail band reads correctly in grayscale.

1. **100 % stacked area:** grade shares per year for the filtered theses.
   Hovering shows that year's shares and counts. **Clicking a year** sets the
   bar chart year (drawn as a vertical rule; default = end of range).
2. **100 % stacked bars:** one bar per selected faculty for the chosen year,
   plus a first bar "All selected". Sorted by share of grade 1. Bars with
   n < 20 are faded with a "small sample" note. The year is shown in the title
   and in the URL.
3. **Parallel plot (canvas):**
   - Axes: Grade (categorical 1–4, lines start jittered inside their band) →
     average word length → sentence-length spread → average sentence length →
     lexical diversity → repetition → long-word share.
   - Axes clamp at the 1st–99th percentile. Values outside are pinned to the
     axis end, which the axis label notes.
   - One line per thesis (filtered, clean-body only), coloured by grade at
     alpha ≈ 0.03 with additive blending. Drawn in shuffled order so no grade
     is always on top, which makes the density cloud.
   - **Brushing** on any axis (d3-brush on an SVG overlay): selected theses
     redraw at higher alpha, the rest fade. Shows "N of M theses selected".
     Brushes are stored in the URL.
   - Grade toggles in the legend show/hide a grade's lines.
   - Performance target: full redraw < 100 ms for ~50 k lines. If it misses,
     render in batches with `requestAnimationFrame`, and redraw during a brush
     drag only after the drag pauses.

## 9. Accessibility and i18n

- Meaning is never carried by colour alone: dashes, weights, direct labels and
  hatching back it up. Check every palette in deuteranopia / protanopia /
  tritanopia simulation (a screenshot pass with a CVD filter) before merging a
  view.
- Text contrast ≥ 4.5:1. Chart marks ≥ 3:1 against the background, except the
  deliberately faint context lines and parallel-plot density.
- Each chart has an accessible name, and "Show as table" exposes the
  aggregated numbers. The word cloud can also be shown as a ranked list.
- Everything is keyboard operable: tabs, filters, words, metric picker, year
  selection in the area chart, panel focus.
- All strings live in `cs.ts` / `en.ts`. Numbers, percentages and decimal
  commas use `Intl` with the active locale.

## 10. Phases

The phases are ordered. After phase 2, the two view tracks can run in
parallel, one per team member.

| # | phase | output | done when |
|---|---|---|---|
| 0 | Scaffolding | `web/` (Vite + Svelte 5 + TS), `pipeline/`, lint/format, Vitest, GitHub Actions build | `npm run build` and tests pass in CI |
| 1 | Data pipeline | `theses.bin/json`, `words-*.bin/json`, `check.py` | checks pass; files within size budget |
| 2 | Shell + state | header, tabs, filter panel, URL sync, data loading, i18n skeleton, `select`/`aggregate` + tests | filters change the match count; URL round-trips |
| 3a | Trends view | metric picker, small multiples, hover link | matches a manual pandas check for 2 faculties × 2 metrics |
| 3b | Grades view | area, bars, parallel plot + brushing | grade shares match pandas; parallel plot redraw < 100 ms |
| 3c | Words view | `excess` + tests, cloud, detail chart | top words match a pandas reference for one filter set |
| 4 | Accessibility + i18n pass | tables, keyboard, CVD check, full Czech/English copy | checklist in §9 passes |
| 5 | Polish + deploy | empty/loading/error states, narrow layout, GitHub Pages deploy via Actions | public URL works from a clean browser |

Suggested split: one person takes 3a + 3b (they share the per-thesis table and
aggregation code); the other takes phase 1's word cube and 3c.

## 11. Risks and open items

- **Word-cube size** with the AI split: if it goes over budget, cut the
  vocabulary for 2023+ cells to words that appear in ≥ 1 % of theses, before
  touching the cap for other years.
- **Noisy small faculties** in Words: excess for a single small faculty is
  unreliable. Show the target-year thesis count prominently, and warn below
  ~100 theses.
- **Faculty English names:** a hand-written map to be checked by the team.
- **Hosting:** GitHub Pages is assumed (the repo is private now; Pages on a
  private repo needs a paid plan, so the repo may need to go public).

## 12. As built: deviations from this plan

- **Grade bars are horizontal** (one row per faculty), not vertical as in the
  sketch. With 15 faculties plus "All", vertical bars at half-width made the
  faculty labels collide. Sorted by share of grade 1, thesis count on the right.
- **Word-size ramp is data-relative.** Still 5 steps with the thresholds shown
  in the legend, but they are quantiles of the displayed words' |log₂ ratio|.
  Real deviations at a 1 % minimum share are mostly < 0.6, so a fixed ramp put
  almost every word in the smallest size.
- **Parallel plot opacity per grade** is scaled by √(1 / grade share), so the
  rarer grades 3–4 stay visible next to grade 1 (> 50 % of theses). The
  footnote says so.
- **Word detail faculty lines** need ≥ 50 theses in a faculty-year (rather than
  20): single-word shares in small faculties were too noisy.
- **Single-faculty Trends** replaces "other faculties" and "selection average"
  with a dotted whole-university reference line.
- **d3-cloud is pinned to 1.x**: 2.0 (released during the build) replaced the
  API.

### Critique round 1 (2026-11-16): changes
- **Answer line per view** (`lib/ui/Lede.svelte`, `lib/data/answers.ts`): one computed finding (before = 2018–2022, after = 2023–last complete year) plus "How to read this view".
- **New defaults:** Words compares 2023–2025 with the 2018–2022 trend. Trends opens on long-word share, which moved most relative to its spread (d ≈ +0.16; every measure moved only slightly).
- **Words:**
  - Ratios ("2.8×") replace log₂ in the legend, table and tooltips.
  - Word search, including inflected forms.
  - Clicking a word scrolls its detail into view.
  - The cloud is fitted to its height and is a single tab stop with arrow-key navigation.
  - The compare controls stay visible in table mode.
- **Parallel plot:** lines drawn in true proportion (no rarity boost). A median and middle-half band per grade, each grade with its own dash. "Individual theses" toggle. Scrolls sideways on narrow screens.
- **Grade bars:** faculties with fewer than 50 theses are faded and listed last.
- **Mobile and accessibility:**
  - Below 640px, the theme and language switches move into the drawer, so there is no horizontal overflow.
  - Larger tap targets in the drawer.
  - Skip link to the chart, and a focus ring on the active tab.
  - The Years note is no longer greyed out.
  - The ChatGPT label has a dark halo.
  - Faculty codes in URLs are case-insensitive.
  - Czech is picked automatically for cs/sk browsers.
- **Type:** plate titles are 20px and the answer line 21px, over 16px body text.
- **Word ranking (2026-11-16):** the cloud ranks and sizes words by the absolute change in share of theses (percentage points, observed − expected) by default. Ratios over-reward rare words (1 % → 3 % = 3×, while *klíčový* 49 % → 67 % = 1.4×). A toggle switches to the relative change (×), as in Kobak et al. 2024, which uses both measures. The answer line, table and tooltip show both numbers. Movers need ≥ 0.2 pp (gap mode) or ≥ 1.11× (ratio mode).

### Critique round 2 (2026-11-16): changes
- **Play removed** from Words; the ◀ ▶ step buttons stay.
- **Extraction artefacts repaired** in the pipeline:
  - *ţ→ž*, *ĝ→ř*, *ŧ→ů*.
  - cs/sk words with characters impossible in Czech or Slovak prose (detached carons, dotless ı, Cyrillic, …) are dropped.
  - Counts are distinct theses after the merge.
  - `check.py` fails if any artefact survives.
  - The client also skips noise tokens (single letters, http/https, citation shorthand).
- **English glosses:** curated in `pipeline/glosses_cs.json` (216 base forms, expanded to their main forms in `glosses-cs.json`). Shown in English mode in the answer line, tooltip, table, detail and search.
- **Framing:** a cautious note under the Words answer line on AI-associated vocabulary. Search explains why there is no match and points to the AI filter.
- **Filter panel:** the AI-use declaration group comes first, with definitions. A note explains the option counts. Years are hidden in the Words view.
- **Words controls:** the timeline plus a plain sentence lead. The year dropdowns sit behind "Precise years"; ranking, forms and minimum share behind "Options".
- **Trends:** panels sorted by change after 2022, other faculties fainter with a toggle, ChatGPT labelled on the top row, sticky plate header.
- **Mobile and accessibility:**
  - Fixed the 340px plate-header gap.
  - 40–44px touch targets on coarse pointers.
  - Drawer gets a "Done" button and closes on Escape, with focus returned to the Filters button.
  - Scroll hint for the parallel plot.
  - Search is a combobox with arrow-key navigation.
  - Small-faculty labels stay readable (only the bar fades).
  - Ink contour on the medians, stronger swatch edges.

### Critique round 3 changes (29/40)

- AI-declaration filter is framed honestly: while it narrows 2023+, the answer lines in Words,
  Trends and Grades say they compare a different group (not before/after), name only the years
  that hold ≥ 20 such theses (`dataSpan` in `answers.ts`), and each plate shows `AiCaveat`.
  The filter panel notes that the count still includes all pre-2023 theses.
- Share metrics (lexical diversity, phrase repetition, long-word share) are stored as
  percentages by the pipeline (`PCT_METRICS`), so readers see "38.4 %", not "0.384".
- Grades: the answer line opens with a verdict (`GradeShift.same`, both shares within 1.5 pp);
  new "Writing style by grade" dot plot (`GradeDots.svelte`: median + middle half per grade,
  shape-coded markers) precedes the parallel plot, whose individual lines are now off by default.
- Words: glosses in the cloud's screen-reader labels; tooltip sits below the word; overflow
  count explained; timeline labels no longer collide on phones.
- Mobile drawer is `visibility: hidden` when closed (out of tab order) and only casts a shadow
  when open. Dark mode: small-sample grade bars are outlined, selected tab has a petrol rule.

### Critique round 4 changes (29/40)

- Words opens with the answer line's top rising word shown in "A word over time" (not written
  to the URL; clearing it keeps the placeholder). The AI-vocabulary sentence appears only when
  the top rising words include curated AI-associated words, and names them; the lede is hedged
  when the compared years hold < 100 theses.
- Answer lines are uncertainty-aware: `metricShift.clear` (Welch 95 % interval) and
  `gradeShift.clear` (two-proportion test). Unclear changes read "no clear change / too few
  theses to tell". Share measures report the change in pp, not relative %.
- AI mode: the "different group" note leads each lede; Words drops rise/fall colour; the filter
  count is split (declared from 2023 + earlier, all kept); Trends hides faculties without data
  from 2023 and lists them in one line.
- Grades by faculty defaults to before vs after ChatGPT (paired bars: thin = 2018–2022,
  full = 2023+); clicking a year or "<year> only" switches to a single year. The parallel plot
  ("Grade and writing style") now comes before the dot plot, whose rows follow its axis order.
- Mobile/keyboard: the open drawer is a modal dialog (page behind is `inert`); cloud words are
  positioned on their baseline (no `dy` offset, which caused overlaps); Trends uses a measure
  `<select>` under the answer on phones. Lede measure 72ch.

### Critique round 5 changes (28/40)

- Grade distribution over time veils years with < 20 theses (hatched paper veil, note, tooltip)
  and marks where the AI filter starts; it grows to the height of the faculty bars beside it
  (`Plate grow` + `GradeArea fill`).
- Trends lede adds a computed "when" clause (`MetricShift.step`): when the earlier post years stay
  near the baseline and the last year differs beyond chance, it says most of the change is in that
  year and that a one-year jump can also come from how that year's theses were collected.
- Single-faculty Trends keeps the all-faculty y-scale and is titled "<measure>: <faculty> vs the
  whole university"; the university average line is drawn at full strength.
- Phones: Trends shows two columns and a sticky measure select (plate header no longer sticky
  below 640px). Drawer: theme/language after the filters; skip link inert while open; only the
  count is a live region. Timeline trend-edge grip is wider, with a larger touch zone.
- Parallel plot bands get a thin grade-coloured edge and fainter fill in dark mode; paired-bar key
  uses a grade colour; word-detail figures rounded to 1 decimal, ChatGPT label drawn above bands,
  observed-block mean is a translucent ink bar (petrol stays "selected" only).

### Critique round 6 changes (29/40)

- Privacy: no grade breakdown for fewer than 20 theses (`MIN_CELL_N`) anywhere on Grades. Faculty
  bars skip such cells and list them by name; tables print "–" and "<20"; the over-time chart
  veils such years opaquely and its tooltip hides their shares. With one faculty, no "All" row.
- Over-time chart draws the 95 % interval of the fail share, so a small year's spike reads as a
  wide band, not a confident hump.
- Trends counts faculties whose change is beyond their own 95 % interval
  (`facSigUp` / `facSigDown`), not just the direction. The Grades verdict says "differ between the
  two periods" and adds the A–F scale caveat when ETF/FSV are in a small selection.
- Filter panel: Faculty → Years → Language → AI declaration. AI is "All theses / Declared AI use
  only", with the four categories folded behind it; on Words the count names its years.
- Parallel plot: measures ordered by how much the grades differ (same order in the dot plot);
  half gap after the grade axis; neutral grey bands, grade colour on medians only; grade 2
  median cased; a note when all medians coincide; haloed tick labels.
- Words lede notes that covid/pandemic drops are the pandemic years inside the trend. Signed
  numbers use a true minus; the Trends legend label is translated.

### Critique round 7 changes (visual simplicity; 28/40)

- Petrol only for real choices: Chart/Table is a quiet text toggle ("Show table"); faculty and
  language checkboxes are ink; dark-mode petrol is a teal-grey (#8fc1bd) distinct from rise blue.
- Grades: grade 1–2 area fills softened (3–4 stay strong), area chart capped at 420px; faculty
  bars show "All" + the 6 faculties whose excellent share moved most ("Show all N faculties");
  period key in ink; one shared grade legend (swatch + hatch, dash, marker shape) under the lede
  replaces the four per-plate keys; small faculties grey instead of italic.
- AI mode: one ochre caveat per view (the answer-line note); the in-plate caveat is gone and the
  filter-panel split is plain grey.
- Words: one-sentence answer (three words, glosses, no colour); drops and notes in one quiet line;
  25 words per side in the cloud.
- Type: plate titles 17px, year range 15px, chart text ≥ 11px, half sizes removed.
- Phones: Trends legend moves under the charts.

### Critique round 8 changes (28/40)

- Grades by faculty: the default 6 are the faculties whose "excellent" share changed most clearly
  (two-proportion z, furthest beyond chance), named in a caption; A–F faculties marked †; the
  missing-faculty notes merged into one line; the plate no longer stretches to the area chart.
- AI mode: ledes add "the gap is beyond / within chance"; Trends note says "fewer than 20 theses
  per year"; the bars toggle reads "2018–2022 vs 2023–2025"; ChatGPT and the AI-filter start are
  one marker with a two-part label (Trends and the grade area).
- Words: the comparison sentence (duplicated in the plate unit) and the drag hint (now in the
  how-to; sr-only in place) are gone; on phones the cloud comes first and the year controls fold
  behind "2023–2025 vs the trend 2018–2022 · change years" below it (`Plate leadLast`).
- Petrol: selected cloud/table word marked with a thick ink underline (keeps its rise/fall
  colour); the Trends "other selected" legend checkbox is ink.
- Parallel plot: the overlap note names the number of grades shown; wider first gap so "Grade"
  and the first axis label never collide. Grade-area ChatGPT label is plain ink; no-break spaces
  keep "3.6 % → 3.6 %" together.

## Author gender filter (dataset update, 2026-11-17)

- The dataset added `author_gender` (female / male inferred from the name, null when the name does not tell; ~7 %).
- `theses.bin.gz` gains a u8 `gender` column (0 unknown, 1 female, 2 male).
- Word cubes gain gender as the outermost cell dimension (×3 cells), so the Words view honours the filter.
  Czech cubes grow to ~4.7 MB (forms) and ~4.0 MB (lemmas) gz; the check budget is 5 MB.
- Filter panel: "Author gender" (Women / Men / Name does not tell) after Language, with a note that it is inferred. URL key `g`.

## Critique round 9 (Simple version, 25/40) and chart zoom

- Simple: short faculty names; parallel plot detailed-only; screen-reader tables; labelled trend/target bands on the
  word chart; Words count covers the compared years; AI mode breaks the word line at 2023 and the cloud subtitle uses
  the same years as the lede; mode switch is a "Show details" text toggle. Caveats stay detailed-only (user's choice).
- Minor: dot-plot double bracket, "Not clear from name", "Other", equal finding weights, `text-wrap: pretty` on notes.
- Zoom: drag on any time-series chart zooms all of them; double-click / Esc / zoom bar resets.

## Grade filter

- Filter panel "Grade": 1 excellent … 4 fail, plus "No grade"; URL key `gr`. Applies to Trends and Grades.
- Words cannot honour it (the word cubes have no grade split; adding one would make them ~5× larger), so the
  fieldset is disabled there with a one-line reason shown in both versions; `buildWordContext` ignores it.

## Critique round 10 (28/40) changes

- Empty selection: `lib/ui/EmptyNote.svelte` names the empty filter (faculty, language, gender, grade, AI) in the
  answer line and offers "Select all faculties" or "Reset to defaults" (`resetFilters` in `app.svelte.ts`).
- Words detail on phones (< 480 px): the difference moves under the chart in words ("+17.8 percentage points"),
  the two band labels stack, the ChatGPT label flips left near the right edge. The observed dot is labelled as the
  target-period average.
- Zoom joins the URL (`z=`), subtitles show zoomed years, and the zoom bar can apply it as the year filter.
- Trends grid: one Tab stop, ↑/↓/Home/End move between panels (roving tabindex); fixed "Name · ABBR" spacing.
- Disabled filter groups fade only their options; the reason stays at full contrast.
- Faculty short names everywhere in Simple (Grades bars too) and next to the code in the Detailed filter; the first
  before/after bar pair names its periods, the earlier bar is lighter.
- Percent ticks through `L.f.pct`; plate titles 20 px; the masthead subtitle no longer claims a full 2026.

## Critique round 11 (per view: Words 30, Grades 29, Trends 27) changes

- Trends: the answer line is a sentence (verdict in bold, then "from X to Y unit (periods)"; the relative change is
  Detailed-only). Hovering highlights a peer faculty only in Detailed, in ink with its abbreviation at the line end
  (petrol stays "selected"). The legend sits in the plate header on phones too. A zoom clears an out-of-range
  keyboard readout; the subtitle says "in faculty order" when no year after 2022 is selected.
- Words: a note in the filter panel when the chosen years differ from the default (Words uses its own periods);
  the empty state uses the shared EmptyNote in the answer line and hides the legend and detail plate; Simple shows
  "bigger word = bigger gap"; the cloud's Tab stop starts on the selected word and its labels name observed/expected;
  the phone detail chart uses short spans ("2018–22") on one row and fits the trend line inside the plot.
- Grades: Simple subtitle says what the number on the right is; the trimmed bar list says "The 6 faculties where the
  'excellent' share changed most"; a one-line key explains outlined (small-sample) bars; tooltips use short names.
- EmptyNote restores only the empty group (e.g. "Select Czech", "Select all", "All theses").
- Touch / phone widths: 44 px tap targets for tabs, the Filters button, segmented buttons, "Show all", the word
  search; the answer line's word buttons get an invisible 44 px hit area.
