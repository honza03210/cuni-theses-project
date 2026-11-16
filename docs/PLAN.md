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
