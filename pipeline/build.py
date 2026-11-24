"""Build the compact browser data for the explorer from the dataset parquet files.

Reads  data/theses.parquet, data/word_counts.parquet   (scripts/download_data.py --all)
Writes web/public/data/theses.bin.gz + theses.json
       web/public/data/words-<lang>.bin.gz + words-<lang>.json   (lang = cs, en, sk, other)

Run:   .venv/bin/python -I pipeline/build.py
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import duckdb
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "web" / "public" / "data"

YEAR_MIN, YEAR_MAX = 2006, 2026
AI_YEAR = 2023  # AI-use declarations exist from this year on
PRE_YEARS = AI_YEAR - YEAR_MIN  # 17 years without the AI split
POST_YEARS = YEAR_MAX - AI_YEAR + 1  # 4 years with the AI split

LANGS = ["cs", "en", "sk", "other"]
# index 0 = not available (pre-2023, restricted text, ...)
AI_VALUES = [None, "declared use", "declared no use", "template only", "no statement found"]
# author_gender is inferred from the name in the dataset; index 0 = the name does not tell
GENDERS = [None, "female", "male"]
GENDER_CASE = "CASE author_gender WHEN 'female' THEN 1 WHEN 'male' THEN 2 ELSE 0 END"

FACULTIES = [
    # code, abbreviation, Czech name, English name
    ("ff", "FF", "Filozofická fakulta", "Faculty of Arts"),
    ("fhs", "FHS", "Fakulta humanitních studií", "Faculty of Humanities"),
    ("fsv", "FSV", "Fakulta sociálních věd", "Faculty of Social Sciences"),
    ("pedf", "PedF", "Pedagogická fakulta", "Faculty of Education"),
    ("ftvs", "FTVS", "Fakulta tělesné výchovy a sportu", "Faculty of Physical Education and Sport"),
    ("etf", "ETF", "Evangelická teologická fakulta", "Protestant Theological Faculty"),
    ("htf", "HTF", "Husitská teologická fakulta", "Hussite Theological Faculty"),
    ("ktf", "KTF", "Katolická teologická fakulta", "Catholic Theological Faculty"),
    ("mff", "MFF", "Matematicko-fyzikální fakulta", "Faculty of Mathematics and Physics"),
    ("prf", "PřF", "Přírodovědecká fakulta", "Faculty of Science"),
    ("lf1", "1. LF", "1. lékařská fakulta", "First Faculty of Medicine"),
    ("lf2", "2. LF", "2. lékařská fakulta", "Second Faculty of Medicine"),
    ("lf3", "3. LF", "3. lékařská fakulta", "Third Faculty of Medicine"),
    ("lfhk", "LF HK", "Lékařská fakulta v Hradci Králové", "Faculty of Medicine in Hradec Králové"),
    ("faf", "FaF", "Farmaceutická fakulta v Hradci Králové", "Faculty of Pharmacy in Hradec Králové"),
]

METRICS = [
    # column, cs label, en label, cs unit, en unit, cs description, en description, decimals
# Shares (0–1) are stored as percentages so the public reads "38.4 %", not "0.384".
    ("mean_word_len", "Průměrná délka slova", "Average word length", "písmen", "letters",
     "Průměrný počet písmen ve slově.", "Mean number of letters per word.", 2),
    ("mean_sentence_len", "Průměrná délka věty", "Average sentence length", "slov", "words",
     "Průměrný počet slov ve větě.", "Mean number of words per sentence.", 1),
    ("std_sentence_len", "Rozptyl délky vět", "Sentence-length spread", "slov (sm. odch.)", "words (std. dev.)",
     "Směrodatná odchylka délky vět: nízká = věty jsou si podobně dlouhé.",
     "Standard deviation of sentence length: low = sentences are uniformly long.", 1),
    ("mattr", "Lexikální rozmanitost", "Lexical diversity", "% různých slov", "% distinct words",
     "Jak pestrou slovní zásobu text používá: podíl různých slov v každém úseku 500 slov.",
     "How varied the vocabulary is: share of distinct words in each 500-word stretch.", 1),
    ("repeated_trigram_ratio", "Opakování frází", "Phrase repetition", "% opakovaných frází", "% repeated phrases",
     "Podíl tříslovných frází, které se opakují v rámci 2 000 slov.",
     "Share of three-word phrases repeated within 2,000 words.", 1),
    ("long_word_ratio", "Podíl dlouhých slov", "Long-word share", "% slov > 6 písmen", "% of words > 6 letters",
     "Podíl slov delších než 6 písmen.", "Share of words longer than 6 letters.", 1),
    ("em_dash_per_1000w", "Dlouhé pomlčky", "Em dashes", "na 1 000 slov", "per 1,000 words",
     "Počet dlouhých pomlček „—“ na 1 000 slov.", "Em dashes “—” per 1,000 words.", 2),
    ("comma_per_1000w", "Čárky", "Commas", "na 1 000 slov", "per 1,000 words",
     "Počet čárek na 1 000 slov.", "Commas per 1,000 words.", 1),
    ("first_person_sg_per_1000w", "1. osoba jednotného čísla", "First person singular", "na 1 000 slov", "per 1,000 words",
     "Zájmena a tvary 1. osoby jednotného čísla (já, jsem, můj…) na 1 000 slov.",
     "First-person singular pronouns and forms (I, my, …) per 1,000 words.", 2),
]

PCT_METRICS = {"mattr", "repeated_trigram_ratio", "long_word_ratio"}

# Word vocabulary per language: (max words, min theses overall)
VOCAB = {"cs": (8000, 30), "en": (5000, 20), "sk": (4000, 15), "other": (2500, 10)}
VOCAB_RANK_FROM = 2015  # rank words by number of theses using them from this year on


def lang_group_sql(col: str = "lang") -> str:
    return f"CASE WHEN {col} IN ('cs','en','sk') THEN {col} ELSE 'other' END"


def write_gz(path: Path, payload: bytes) -> int:
    path.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
    return path.stat().st_size


def build_theses(con: duckdb.DuckDBPyConnection) -> dict:
    fac_case = "CASE fac " + " ".join(f"WHEN '{f[0]}' THEN {i}" for i, f in enumerate(FACULTIES)) + " END"
    lang_case = "CASE " + lang_group_sql() + " " + " ".join(f"WHEN '{l}' THEN {i}" for i, l in enumerate(LANGS)) + " END"
    ai_case = "CASE ai_declaration " + " ".join(
        f"WHEN '{v}' THEN {i}" for i, v in enumerate(AI_VALUES) if v) + " ELSE 0 END"
    metric_cols = ", ".join(m[0] for m in METRICS)
    df = con.sql(f"""
        SELECT {fac_case} AS fac, year - {YEAR_MIN} AS year, {lang_case} AS lang,
               CASE WHEN year >= {AI_YEAR} THEN {ai_case} ELSE 0 END AS ai,
               {GENDER_CASE} AS gender,
               COALESCE(CAST(grade_points AS INTEGER), 0) AS grade,
               CAST(COALESCE(usable, false) AS INTEGER) AS usable,
               CAST(COALESCE(usable, false) AND body_method = 'intro-back' AS INTEGER) AS clean,
               {metric_cols},
               round(em_dash_per_1000w * prose_n_words / 1000) AS em_dash_n
        FROM read_parquet('{DATA / "theses.parquet"}')
        WHERE year BETWEEN {YEAR_MIN} AND {YEAR_MAX}
        ORDER BY year, fac, item_id
    """).df()
    assert df["fac"].notna().all(), "unknown faculty code"
    n = len(df)

    u8_cols = ["fac", "year", "lang", "ai", "gender", "grade", "usable", "clean"]
    parts: list[bytes] = []
    columns = []
    offset = 0
    for c in u8_cols:
        b = df[c].to_numpy(np.uint8).tobytes()
        columns.append({"name": c, "type": "u8", "offset": offset})
        parts.append(b)
        offset += len(b)
    pad = (-offset) % 4
    parts.append(b"\0" * pad)
    offset += pad
    metrics_meta = []
    for m in METRICS:
        col, lcs, len_, ucs, uen, dcs, den, dec = m
        arr = df[col].to_numpy(np.float32)
        if col in PCT_METRICS:
            arr = arr * np.float32(100)
        # Style metrics are only meaningful for cleanly cut bodies
        arr = np.where(df["clean"].to_numpy() == 1, arr, np.nan).astype(np.float32)
        b = arr.tobytes()
        columns.append({"name": col, "type": "f32", "offset": offset})
        parts.append(b)
        offset += len(b)
        finite = arr[np.isfinite(arr)]
        metrics_meta.append({
            "key": col, "label": {"cs": lcs, "en": len_}, "unit": {"cs": ucs, "en": uen},
            "desc": {"cs": dcs, "en": den}, "decimals": dec,
            "p01": float(np.percentile(finite, 1)), "p99": float(np.percentile(finite, 99)),
        })
    size = write_gz(OUT / "theses.bin.gz", b"".join(parts))
    write_playground(df)

    meta = {
        "rows": n,
        "yearMin": YEAR_MIN, "yearMax": YEAR_MAX, "aiYear": AI_YEAR,
        "columns": columns,
        "faculties": [{"code": f[0], "abbr": f[1], "name": {"cs": f[2], "en": f[3]}} for f in FACULTIES],
        "langs": LANGS,
        "aiValues": [v or "n/a" for v in AI_VALUES],
        "genders": [v or "unknown" for v in GENDERS],
        "metrics": metrics_meta,
    }
    (OUT / "theses.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f"theses: {n} rows, {size / 1e6:.2f} MB gz")
    return meta


PLAY_MISSING = 65535


def write_playground(df) -> None:
    """Extra per-thesis columns for the playground page (playground.html), in theses.bin row order:
    u16 em-dash count (65535 = no clean body)."""
    n = df["em_dash_n"].to_numpy(np.float64)
    ok = (df["clean"].to_numpy() == 1) & np.isfinite(n)
    arr = np.where(ok, np.clip(n, 0, PLAY_MISSING - 1), PLAY_MISSING).astype(np.uint16)
    size = write_gz(OUT / "playground.bin.gz", arr.tobytes())
    (OUT / "playground.json").write_text(json.dumps(
        {"rows": len(df), "columns": [{"name": "em_dash_n", "type": "u16", "offset": 0, "missing": PLAY_MISSING}]}))
    print(f"playground: {len(df)} rows, {size / 1e3:.0f} kB gz")


def build_words(con: duckdb.DuckDBPyConnection) -> None:
    wc = DATA / "word_counts.parquet"
    if not wc.exists():
        sys.exit("data/word_counts.parquet missing: run scripts/download_data.py --all")
    fac_case = "CASE fac " + " ".join(f"WHEN '{f[0]}' THEN {i}" for i, f in enumerate(FACULTIES)) + " END"
    ai_case = "CASE ai_declaration " + " ".join(
        f"WHEN '{v}' THEN {i}" for i, v in enumerate(AI_VALUES) if v) + " ELSE 0 END"
    # cell index: years < AI_YEAR -> fac*PRE + (year-YEAR_MIN);
    #             years >= AI_YEAR -> base + (fac*POST + (year-AI_YEAR))*5 + ai
    #             plus gender * per_gender (gender is the outermost dimension)
    base = len(FACULTIES) * PRE_YEARS
    per_gender = base + len(FACULTIES) * POST_YEARS * len(AI_VALUES)
    n_cells = per_gender * len(GENDERS)
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE t AS
        SELECT item_id, {lang_group_sql()} AS lg, year,
               ({GENDER_CASE}) * {per_gender} +
               CASE WHEN year < {AI_YEAR}
                    THEN ({fac_case}) * {PRE_YEARS} + (year - {YEAR_MIN})
                    ELSE {base} + (({fac_case}) * {POST_YEARS} + (year - {AI_YEAR})) * {len(AI_VALUES)} + ({ai_case})
               END AS cell
        FROM read_parquet('{DATA / "theses.parquet"}')
        WHERE usable AND year BETWEEN {YEAR_MIN} AND {YEAR_MAX}
    """)
    # Repair PDF-extraction artefacts in Czech/Slovak text (older PDFs): ţ->ž, ĝ->ř, ŧ->ů.
    # Words with characters that cannot occur in cs/sk prose (detached carons "zˇe", dotless "ı",
    # Cyrillic/Greek, ...) are fragments of broken extraction and are dropped.
    # After repair, "že" and "ţe" are the same word, so counts are DISTINCT theses.
    con.sql(f"""
        CREATE OR REPLACE TEMP TABLE wc AS
        SELECT lg, year, cell, tid, word FROM (
            SELECT t.lg, t.year, t.cell, t.tid,
                   CASE WHEN t.lg IN ('cs', 'sk') THEN translate(w.word, '{BROKEN_FROM}', '{BROKEN_TO}') ELSE w.word END AS word
            FROM read_parquet('{wc}') w JOIN (SELECT *, row_number() OVER () AS tid FROM t) t USING (item_id)
        )
        WHERE lg NOT IN ('cs', 'sk') OR regexp_full_match(word, '[{CS_SK_LETTERS}]+')
    """)
    for lang in LANGS:
        cap, min_docs = VOCAB[lang]
        # 1) word forms, as in the dataset
        vocab = con.sql(f"""
            SELECT word FROM wc WHERE lg = '{lang}'
            GROUP BY word
            HAVING count(DISTINCT tid) >= {min_docs}
            ORDER BY count(DISTINCT tid) FILTER (WHERE year >= {VOCAB_RANK_FROM}) DESC, word
            LIMIT {cap}
        """).df()["word"].tolist()
        con.register("vocab", con.sql("SELECT unnest($v) AS word, generate_subscripts($v, 1) - 1 AS wi",
                                      params={"v": vocab}).df())
        counts = con.sql(f"""
            SELECT v.wi, wc.cell, count(DISTINCT wc.tid) AS n
            FROM wc JOIN vocab v USING (word)
            WHERE wc.lg = '{lang}'
            GROUP BY 1, 2
        """).df()
        write_cube(lang, "", vocab, counts, n_cells, None)
        con.unregister("vocab")

        # 2) lemmas: inflected forms merged; a thesis counts once per lemma
        if lang not in LEMMA_LANGS:
            continue
        forms = con.sql(f"SELECT word, count(DISTINCT tid) AS n FROM wc WHERE lg = '{lang}' GROUP BY word HAVING count(DISTINCT tid) >= 3").df()
        mapping = lemmatize_vocab(forms["word"].tolist(), lang)
        forms["lemma"] = forms["word"].map(mapping)
        con.register("lmap", forms[["word", "lemma"]])
        lvocab = con.sql(f"""
            SELECT m.lemma FROM wc JOIN lmap m USING (word)
            WHERE wc.lg = '{lang}'
            GROUP BY m.lemma
            HAVING count(DISTINCT wc.tid) >= {min_docs}
            ORDER BY count(DISTINCT wc.tid) FILTER (WHERE wc.year >= {VOCAB_RANK_FROM}) DESC, m.lemma
            LIMIT {cap}
        """).df()["lemma"].tolist()
        lpos = {w: i for i, w in enumerate(lvocab)}
        sub = forms[forms["lemma"].isin(lpos)].copy()
        sub["wi"] = sub["lemma"].map(lpos)
        con.register("lsub", sub[["word", "wi"]])
        lcounts = con.sql(f"""
            SELECT l.wi, wc.cell, count(DISTINCT wc.tid) AS n
            FROM wc JOIN lsub l USING (word)
            WHERE wc.lg = '{lang}'
            GROUP BY 1, 2
        """).df()
        # the most used forms behind each lemma (for labels/tooltips)
        top = (sub.sort_values(["wi", "n"], ascending=[True, False]).groupby("wi")["word"]
               .apply(lambda ws: [w for w in ws if w][:4]).to_dict())
        write_cube(lang, "-lemma", lvocab, lcounts, n_cells, [top.get(i, []) for i in range(len(lvocab))])
        con.unregister("lmap"); con.unregister("lsub")


LEMMA_LANGS = {"cs": "cs", "en": "en", "sk": "sk"}
BROKEN_FROM, BROKEN_TO = "ţĝŧ", "žřů"
# letters of Czech and Slovak prose, plus plain Latin and common German loans
CS_SK_LETTERS = "a-záäčďéěíĺľňóôŕřšťúůýžöüß"
VERB_ENDINGS = ("uje", "ují", "ujících", "ující", "ujícím", "ujíc", "oval", "ovala", "ovali", "ovalo", "ovaly",
                "ujeme", "ujete", "uju", "uji", "ujme", "ujte", "ován", "ována", "ováno", "ováni", "ovány")


def lemmatize_vocab(words: list[str], lang: str) -> dict[str, str]:
    """Dictionary lemmatization (simplemma) with two fixes for Czech/Slovak:
    keep negation (nesouhlasí -> nesouhlasit, not souhlasit), and map unknown
    -ovat verb forms (reflektuje -> reflektovat) when that infinitive occurs."""
    import simplemma
    code = LEMMA_LANGS[lang]
    vocab = set(words)
    out: dict[str, str] = {}
    for w in words:
        lem = simplemma.lemmatize(w, lang=code)
        if lang in ("cs", "sk") and w.startswith("ne") and len(w) > 4 and not lem.startswith("ne"):
            if simplemma.lemmatize(w[2:], lang=code) == lem:
                lem = "ne" + lem
        if lang in ("cs", "sk") and lem == w:
            for end in VERB_ENDINGS:
                if w.endswith(end) and len(w) - len(end) >= 3:
                    inf = w[: -len(end)] + "ovat"
                    if inf in vocab:
                        lem = inf
                    break
        out[w] = lem
    return out


def write_cube(lang: str, suffix: str, vocab: list[str], counts, n_cells: int, forms) -> None:
    mat = np.zeros((len(vocab), n_cells), dtype=np.uint16)
    assert counts["n"].max() < 65535
    mat[counts["wi"].to_numpy(), counts["cell"].to_numpy()] = counts["n"].to_numpy()
    size = write_gz(OUT / f"words-{lang}{suffix}.bin.gz", mat.tobytes())
    meta = {
        "lang": lang, "words": vocab, "cells": n_cells,
        "preYears": PRE_YEARS, "postYears": POST_YEARS, "aiValues": len(AI_VALUES),
        "faculties": len(FACULTIES), "genders": len(GENDERS),
    }
    if forms is not None:
        meta["forms"] = forms
    (OUT / f"words-{lang}{suffix}.json").write_text(json.dumps(meta, ensure_ascii=False))
    print(f"words-{lang}{suffix}: {len(vocab)} x {n_cells} cells, {size / 1e6:.2f} MB gz")


def build_glosses() -> None:
    """English glosses for Czech words (curated in pipeline/glosses_cs.json, keyed by base form),
    expanded to the main inflected forms listed in words-cs-lemma.json."""
    glosses = json.loads((ROOT / "pipeline" / "glosses_cs.json").read_text())
    lemma = json.loads((OUT / "words-cs-lemma.json").read_text())
    out = dict(glosses)
    for word, forms in zip(lemma["words"], lemma["forms"]):
        if word in glosses:
            for f in forms:
                out.setdefault(f, glosses[word])
    (OUT / "glosses-cs.json").write_text(json.dumps(out, ensure_ascii=False, sort_keys=True))
    print(f"glosses-cs: {len(glosses)} base forms, {len(out)} entries")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if "--glosses-only" in sys.argv:
        build_glosses()
        return
    con = duckdb.connect()
    con.sql("SET memory_limit='10GB'")
    build_theses(con)
    if "--theses-only" not in sys.argv:
        build_words(con)
        build_glosses()


if __name__ == "__main__":
    main()
