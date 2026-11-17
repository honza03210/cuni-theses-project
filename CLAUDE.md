# CLAUDE.md

Interactive explorer of the Hugging Face dataset
`honza03210/cuni-bachelor-theses-style`: derived style features of Charles
University bachelor's theses (2006–2026) and their grades, used to show how
student writing changed after LLMs (ChatGPT, Nov 2022). It's a course project
built by a team of two; see `PRODUCT.md` (product context), `docs/PLAN.md`
(spec) and `DESIGN.md` (visual system).

## Commands

- Web app (in `web/`): `npm run dev`, `npm test` (Vitest), `npm run check`
  (svelte-check + tsc), `npm run build`.
- Data pipeline (repo root): `.venv/bin/python -I pipeline/build.py`, then
  `.venv/bin/python -I pipeline/check.py`. It needs `data/*.parquet` from
  `scripts/download_data.py --all`.

## Architecture

- `pipeline/build.py` → `web/public/data/` (committed, about 5 MB gz):
  - `theses.bin.gz`: columnar per-thesis table. u8 columns (fac, year offset,
    lang, ai, gender, grade, usable, clean), then f32 metric columns. Metrics are NaN
    unless `clean` (`body_method == "intro-back"`). The layout is described in
    `theses.json`.
  - `words-<lang>.bin.gz`: dense Uint16 word × cell matrix of "theses using the
    word ≥ 2×". The cell layout is defined in `build.py` and mirrored in
    `web/src/lib/data/excess.ts` (`cellIndex`); keep the two in sync. Gender
    (0 unknown, 1 female, 2 male) is the outermost cell dimension.
- `web/src/lib/state/app.svelte.ts` holds the one `$state` object for every
  filter/view setting. `url.ts` encodes and decodes it to the query string, and
  `App.svelte` syncs it with `replaceState`. New persistent UI state goes
  there, with a round-trip test in `data.test.ts`.
- Aggregation is pure and runs in the browser: `select.ts` (filter mask),
  `aggregate.ts` (metric means, grade counts) and `excess.ts` (word trend fit
  and scores). Put logic there, not in components, and unit-test it.
- `lib/ui/Plate.svelte` is the yearbook "plate" wrapper (title, unit, tools,
  chart/table toggle, footnote + source). Every chart lives in one.

## Analysis rules (keep the charts honest)

- Style trends: only `clean` rows; don't mix languages (the UI warns).
  Faculty × year cells with n < 20 are hidden (`MIN_CELL_N`).
- The AI-declaration filter only narrows years ≥ 2023 (`filterMask`).
- Author gender is inferred from the name in the dataset, not self-reported;
  say so wherever it is shown.
- 2026 is incomplete: drawn dotted and excluded from the default range.
- Grades: common 1–4 scale (`grade_points`). A–F only exists at ETF/FSV.
- Word data counts words used ≥ 2× per thesis. Lemma cubes (`words-<lang>-lemma`)
  merge forms via `lemmatize_vocab` in `pipeline/build.py` (simplemma + negation
  and -ovat fixes); a thesis counts once per lemma. Raw forms: `words-<lang>`.
- Never single out individual theses, students or reviewers.

## Design rules

- Tokens are in `web/src/app.css`. Petrol (`--petrol`) means
  selected/active only. Data colours: `--rise` / `--fall` for words, the
  `--grade-1..4` ColorBrewer RdYlBu palette (grade 4 also hatched), and
  `--avg` dashed for averages.
- Never encode with colour alone: pair it with dash, weight, hatch or a direct
  label.
- All UI text lives in `web/src/lib/i18n.ts`, in both `cs` and `en`. Format
  numbers through `L.f`.
