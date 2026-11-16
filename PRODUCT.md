# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Svelte 5 + Vite + TypeScript, D3 (+ d3-cloud, canvas for dense plots); a
Python + DuckDB pipeline in `pipeline/` precomputes compact data files for the
browser. Static site; GitHub Pages assumed. Stack chosen by Claude on the
user's delegation, then confirmed. Full plan: `docs/PLAN.md`.

## Users

Members of the general public, mostly Czech, who are curious whether ChatGPT
and other LLMs changed how university students write. They are not
statisticians or linguists; they arrive with a question ("did students start
writing with AI?") and want an honest answer they can understand in a few
minutes. Secondary audience: the course instructors grading the project
(see Operating Context).

## Product Purpose

A bilingual (Czech / English) interactive explorer of 66,138 bachelor's
theses defended at Charles University in 2000–2026 and their reviews, built
as a team course project (two students). A persistent filter panel (faculty,
years, language, AI-use declaration) drives three views: **Words** (words
used more/less than their trend predicts, with per-word detail), **Trends**
(style metrics per faculty over time against the selection average) and
**Grades** (grade distribution over time, per faculty, and a parallel plot
relating grades to style). Success: a curious non-expert can find out for
themselves what changed after ChatGPT (Nov 2022), and the views never
overstate what the data shows.

## Positioning

Built on a dataset the author created themselves from the full Charles
University repository: every bachelor's thesis over 26 years, measured
consistently, with real AI-use declarations and ChatGPT-tagged citations. It
is evidence from one whole university, not anecdotes or AI-detector guesses.

## Operating Context

- A school assignment (course project). Course requirements are not yet
  recorded here; add them when known.
- Readers open it on desktop or phone, likely from a shared link.
- Data source: https://huggingface.co/datasets/honza03210/cuni-bachelor-theses-style
  (CC BY 4.0). Theses themselves are public at dspace.cuni.cz.

## Capabilities and Constraints

- Bilingual: every piece of text, label, and annotation exists in Czech and
  English, with a language switch.
- The dataset holds no full texts, abstracts, or personal names; the site
  must not suggest otherwise or try to identify individual students,
  supervisors, or theses as AI users.
- Honest comparisons only: style trends use the comparable subset (usable,
  Czech, `body_method == "intro-back"`, year ≥ 2006); 2026 is incomplete;
  faculty mix shifts over time; AI fields exist only from 2023; keyword-based
  AI mentions include theses *about* AI and declarations of non-use. See
  CLAUDE.md for the full list.
- Undecided: which specific findings/charts make the final cut; hosting.

## Evidence on Hand

- The five parquet tables of the dataset above (theses, reviews,
  word_counts, word_freq_by_year, word_freq_totals) and its dataset card.
- No findings have been computed yet in this repo; no numbers beyond those in
  the dataset card may be stated until they are computed from the data.

## Product Principles

1. Honest over dramatic: show uncertainty, caveats, and null results as
   clearly as striking ones.
2. Answer the reader's question first, then let them dig deeper.
3. Every claim is traceable to a computation on the published dataset.
4. Equal quality in Czech and English; neither is a translation afterthought.
5. Aggregate, never individual: no thesis, student, or reviewer is singled out.

## Accessibility & Inclusion

Charts must stay readable for colour-blind readers and on small screens, and
key findings must be available as text, not only as graphics.
