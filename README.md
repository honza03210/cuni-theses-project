# Charles University Bachelor Theses — Explorer

An interactive, bilingual (Czech / English) web explorer of **65,957 bachelor's
theses** defended at Charles University in 2006–2026. It shows how student
writing changed after large language models arrived (ChatGPT, November 2022).

A filter panel (faculty, years, thesis language, AI-use declaration) drives three
views:

| view | what it shows |
|---|---|
| **Words** | A word cloud of words used more or less than their trend predicts. A timeline strip picks the compared year, or a block of several years, and the trend window before it (3–8 years). You drag on the strip, or use the sentence controls or step/play buttons. Click a word to see its trend, with the expected and observed values. |
| **Trends** | Small multiples of style measures per faculty (word length, sentence length and spread, lexical diversity, repetition, punctuation, …). Each panel shows its faculty highlighted, the other faculties in grey and the selection average dashed. |
| **Grades** | A 100 % stacked area of grades over time. Click a year to show per-faculty grade bars for that year. Below, a parallel-coordinates plot links grade to writing style, one line per thesis, with brushable axes. |

Every chart can switch to its data table. The whole state (view, filters,
selected word, brushes) is kept in the URL, so any view can be shared as a link.

Data: [`honza03210/cuni-bachelor-theses-style`](https://huggingface.co/datasets/honza03210/cuni-bachelor-theses-style)
(CC BY 4.0). These are text-free derived features: no thesis texts or personal
names.

## Run it

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (data logic, URL state)
npm run check      # type check
npm run build      # static site in web/dist/
```

The browser data in `web/public/data/` is committed (about 5 MB compressed), so
the site runs without downloading the source dataset.

## Rebuild the data

Only needed if the dataset or the pipeline changes:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/download_data.py --all   # ~540 MB into data/
.venv/bin/python -I pipeline/build.py             # writes web/public/data/
.venv/bin/python -I pipeline/check.py             # sanity checks
```

`pipeline/build.py` writes two kinds of files:

- `theses.bin.gz` + `theses.json`: one row per thesis (faculty, year,
  language, AI declaration, grade, nine style measures), as columnar typed
  arrays. Trends and Grades are computed from it in the browser.
- `words-<lang>.bin.gz` + `.json`: for the top 8,000 (Czech) / 5,000 / 4,000 /
  2,500 word forms, the number of theses using each word at least twice. Counts
  are split by faculty × year, and for 2023+ also by AI declaration. They feed
  the Words view. For cs/en/sk there is also a `words-<lang>-lemma` cube
  (inflected forms merged into lemmas, a thesis counted once per lemma) with
  the main forms of each lemma in the JSON.

## Deploy

`.github/workflows/pages.yml` type-checks, tests and builds on every push. On
`main` it deploys to GitHub Pages. To enable it, open **Settings → Pages →
Source: GitHub Actions**. Pages on a private repository needs a paid GitHub
plan; otherwise make the repository public.

## How to read the data

- Style measures are only computed for theses whose body text was cut cleanly
  (`body_method = intro-back`). They are not comparable across languages; the
  default filter is Czech only.
- Year × faculty cells with fewer than 20 theses are not drawn. 2026 is
  incomplete, so it is drawn dotted and left out of the default range.
- Grades use a common 1–4 scale (A/B = 1, C/D = 2, E = 3, F = 4).
- The AI-declaration filter only narrows theses from 2023 on. Earlier years stay
  unfiltered as a baseline.
- The word cloud shows base forms (lemmas) by default: inflected forms are
  merged with the `simplemma` dictionary lemmatiser, plus two fixes (negation is
  kept: *nesouhlasí → nesouhlasit*; unknown *-ovat* verbs are mapped when the
  infinitive occurs). A thesis counts for a lemma when it uses one of its forms
  at least twice. A toggle switches back to raw word forms.

## Layout

```
pipeline/   build.py (parquet → browser data), check.py (sanity checks)
scripts/    download_data.py
web/        Svelte 5 + TypeScript + D3 app (Vite)
docs/       PLAN.md: implementation plan
PRODUCT.md  product context;  DESIGN.md: visual system
```
