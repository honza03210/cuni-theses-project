# Charles University Bachelor Theses — Visualizations

Visualizing how bachelor's thesis writing at Charles University (Prague) changed
over 2000–2026, with a focus on the period after the arrival of large language
models (ChatGPT, November 2022).

Data: [`honza03210/cuni-bachelor-theses-style`](https://huggingface.co/datasets/honza03210/cuni-bachelor-theses-style)
on Hugging Face (CC BY 4.0) — text-free, derived features of **66,138 theses**
and **132,024 supervisor/opponent reviews**. No full texts or personal names.

## Dataset at a glance

| table | rows | one row per |
|---|---|---|
| `theses` | 66,138 | thesis: metadata, grade, style metrics, section measures, AI-use declarations, review aggregates |
| `reviews` | 132,024 | supervisor / opponent review: length, reviewer style, sentiment, AI mentions |
| `word_counts` | 87.3 M | (thesis, word form) with count ≥ 2 |
| `word_freq_by_year` | 15.3 M | (year, language group, word form) |
| `word_freq_totals` | small | (year, language group) denominators |

All tables join on `item_id`. See the
[dataset card](https://huggingface.co/datasets/honza03210/cuni-bachelor-theses-style)
for full column documentation.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# download theses, reviews and word_freq_totals into ./data/
python scripts/download_data.py
# add --all for the large word tables (word_counts, word_freq_by_year)
```

Or read straight from the Hub without downloading:

```python
import pandas as pd
t = pd.read_parquet("hf://datasets/honza03210/cuni-bachelor-theses-style/data/theses.parquet")
```

## Recommended subset for trends

Style metrics are only comparable within one language and for cleanly extracted
texts:

```python
t = t[t.usable & (t.lang == "cs") & (t.body_method == "intro-back") & (t.year >= 2006)]  # ~48,300 theses
```

## Ideas to visualize

- Style metrics over time (sentence length, word length, MATTR, em-dash rate,
  repeated trigrams) — pooled and per faculty
- "Excess vocabulary": words whose document share jumps after 2022
  (`word_freq_by_year` / `word_freq_totals`)
- AI-use declarations from 2023 on: share, tools named, purposes, by faculty
- `chatgpt_links` (citations tagged `utm_source=chatgpt.com`)
- Review sentiment vs. grade; reviews mentioning AI
- Supervisor / opponent network via `advisor_id` and `referee_ids`

## Repository layout

```
scripts/     data download and processing scripts
notebooks/   exploratory notebooks
figures/     generated plots (not committed)
data/        downloaded parquet files (not committed)
```

## License

Data: CC BY 4.0, from the dataset above; the theses themselves are
public at [dspace.cuni.cz](https://dspace.cuni.cz).
