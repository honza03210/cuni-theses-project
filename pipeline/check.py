"""Sanity checks for the browser data written by pipeline/build.py.

Run:  .venv/bin/python -I pipeline/check.py
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import duckdb
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "data"
DATA = ROOT / "data"
# word cubes carry a gender dimension (x3 cells) since the dataset added author_gender
BUDGET_MB = {"theses": 3.0, "words-cs": 5.0, "words-en": 5.0, "words-sk": 5.0, "words-other": 5.0}

failures: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


def main() -> None:
    meta = json.loads((OUT / "theses.json").read_text())
    raw = gzip.decompress((OUT / "theses.bin.gz").read_bytes())
    n = meta["rows"]
    cols = {c["name"]: c for c in meta["columns"]}

    def col(name: str) -> np.ndarray:
        c = cols[name]
        dt = np.uint8 if c["type"] == "u8" else np.float32
        return np.frombuffer(raw, dtype=dt, count=n, offset=c["offset"])

    con = duckdb.connect()
    total = con.sql(f"SELECT count(*) FROM read_parquet('{DATA / 'theses.parquet'}')").fetchall()[0][0]
    check(total == 66138, f"source has 66,138 theses (dataset card): {total}")
    in_range = con.sql(f"SELECT count(*) FROM read_parquet('{DATA / 'theses.parquet'}') "
                       f"WHERE year BETWEEN {meta['yearMin']} AND {meta['yearMax']}").fetchall()[0][0]
    check(n == in_range, f"theses.bin rows = theses in {meta['yearMin']}–{meta['yearMax']}: {n} vs {in_range}")
    grade = col("grade")
    check(set(np.unique(grade)) <= {0, 1, 2, 3, 4}, "grades within 0..4")
    check(int(col("fac").max()) < len(meta["faculties"]), "faculty index in range")
    check(int(col("year").max()) <= meta["yearMax"] - meta["yearMin"], "year offset in range")
    ai, year = col("ai"), col("year").astype(int) + meta["yearMin"]
    check(not np.any((ai > 0) & (year < meta["aiYear"])), "no AI declaration before aiYear")
    clean = col("clean").astype(bool)
    for m in meta["metrics"]:
        v = col(m["key"])
        check(not np.any(np.isfinite(v) & ~clean), f"{m['key']}: values only on clean bodies")
        check(m["p01"] < m["p99"], f"{m['key']}: p01 < p99")

    usable = col("usable").astype(bool)
    fac = col("fac")
    lang = col("lang")
    gender = col("gender")
    check(set(np.unique(gender)) <= {0, 1, 2}, "gender in 0..2")
    for li, lg in enumerate(meta["langs"]):
        wm = json.loads((OUT / f"words-{lg}.json").read_text())
        counts = np.frombuffer(gzip.decompress((OUT / f"words-{lg}.bin.gz").read_bytes()), dtype=np.uint16)
        check(counts.size == len(wm["words"]) * wm["cells"], f"words-{lg}: matrix size")
        mat = counts.reshape(len(wm["words"]), wm["cells"])
        # every cell count must be <= the number of usable theses in that cell
        F, pre, post, A, G = wm["faculties"], wm["preYears"], wm["postYears"], wm["aiValues"], wm["genders"]
        per_g = wm["cells"] // G
        check(per_g * G == wm["cells"] and per_g == F * pre + F * post * A, f"words-{lg}: cell layout")
        denom = np.zeros(wm["cells"], dtype=np.int64)
        sel = usable & (lang == li)
        for f, y, a, g in zip(fac[sel], year[sel], ai[sel], gender[sel]):
            if y < meta["aiYear"]:
                c = f * pre + (y - meta["yearMin"])
            else:
                c = F * pre + (f * post + (y - meta["aiYear"])) * A + a
            denom[int(g) * per_g + int(c)] += 1
        check(bool(np.all(mat.max(axis=0) <= denom)), f"words-{lg}: no cell exceeds its thesis count")
        if lg in ("cs", "sk"):
            for suffix in ("", "-lemma"):
                ws = json.loads((OUT / f"words-{lg}{suffix}.json").read_text())["words"]
                bad = [w for w in ws if any(c in w for c in "ţĝŧˇı")]
                check(not bad, f"words-{lg}{suffix}: no extraction artefacts (found {bad[:5]})")

    for name, budget in BUDGET_MB.items():
        size = (OUT / f"{name}.bin.gz").stat().st_size / 1e6
        check(size <= budget, f"{name}.bin.gz {size:.2f} MB <= {budget} MB")

    if failures:
        sys.exit(f"{len(failures)} check(s) failed")
    print("all checks passed")


if __name__ == "__main__":
    main()
