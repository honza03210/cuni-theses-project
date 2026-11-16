# CLAUDE.md

Project: visualizations of the Hugging Face dataset
`honza03210/cuni-bachelor-theses-style` — derived style features of Charles
University bachelor's theses (2000–2026) and their reviews, used to study how
student writing changed after LLMs (ChatGPT, Nov 2022).

## Data

- Download with `python scripts/download_data.py` (core tables) or `--all`
  (adds `word_counts` ~87 M rows and `word_freq_by_year` ~15 M rows). Files land
  in `data/<table>.parquet`.
- `data/` and `*.parquet` are gitignored — never commit data.
- Tables: `theses` (one row per thesis, main table), `reviews`, `word_counts`,
  `word_freq_by_year`, `word_freq_totals`. Join on `item_id`.
- Full column docs: the dataset card
  (https://huggingface.co/datasets/honza03210/cuni-bachelor-theses-style).
  Check it before guessing what a column means.

## Analysis rules (important for correct plots)

- For style trends over time, filter to the comparable subset:
  `usable & lang == "cs" & body_method == "intro-back" & year >= 2006`.
  Mixing languages or extraction methods produces fake trends.
- Faculty composition and language mix shift over time — show per-faculty
  (`fac`) breakdowns alongside pooled numbers.
- The current year (2026) is incomplete; mark it or exclude it.
- Pre-2006 has only 181 theses — exclude from trends.
- `ai_declaration`, `ai_tools`, `ai_purposes`, `chatgpt_links` exist only for
  2023+ with public text (null otherwise). Declarations depend on faculty rules
  → compare within faculty.
- `ai_mentions_*` are keyword matches: theses *about* AI and declarations of
  non-use count too.
- Grades: use `grade_points` (1 best – 4 fail) to compare across the 1–4 and
  A–F scales.
- Review `sentiment` is NaN below 20 own words; correlation with grade is only
  moderate (~−0.3).
- Section metrics (`section_*`) only exist for ~24.5k Czech theses from 2015 on.
- Word tables are not lemmatised — Czech inflected forms are separate words.
  Word share = `n_docs / word_freq_totals.n_docs` for the same year and
  `lang_group`.

## Working with the big tables

- Don't load `word_counts` fully into pandas; use `pyarrow`/`polars`/DuckDB
  with filters and column projection.

## Conventions

- Python 3.12, deps in `requirements.txt`, virtualenv in `.venv/`.
- Reusable code in `scripts/`, exploration in `notebooks/`, outputs in
  `figures/` (gitignored).
- Plots: label axes with units, mark Nov 2022 (ChatGPT release) on time axes.
