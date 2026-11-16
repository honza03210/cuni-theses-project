import { describe, expect, it } from 'vitest';
import { filterMask, countMask } from './select';
import { gradesByYear, metricSeries } from './aggregate';
import { buildWordContext, cellIndex, clampComparison, fitLine, rampFor, rampStep, scoreWords } from './excess';
import { decode, encode, defaults, type Domain } from '../state/url';
import type { Theses, WordCube } from './types';

// Tiny synthetic table: 2 faculties, years 2006..2026, 1 language.
function makeTheses(rows: { fac: number; year: number; lang?: number; ai?: number; grade?: number; v?: number }[]): Theses {
  const n = rows.length;
  const u8 = (f: (r: (typeof rows)[number]) => number) => Uint8Array.from(rows.map(f));
  return {
    meta: {
      rows: n, yearMin: 2006, yearMax: 2026, aiYear: 2023, columns: [],
      faculties: [{ code: 'a', abbr: 'A', name: { cs: 'A', en: 'A' } }, { code: 'b', abbr: 'B', name: { cs: 'B', en: 'B' } }],
      langs: ['cs', 'en', 'sk', 'other'], aiValues: ['n/a', 'u', 'nu', 't', 'ns'],
      metrics: [{ key: 'm', label: { cs: '', en: '' }, unit: { cs: '', en: '' }, desc: { cs: '', en: '' }, decimals: 2, p01: 0, p99: 10 }],
    },
    n,
    fac: u8((r) => r.fac), year: u8((r) => r.year - 2006), lang: u8((r) => r.lang ?? 0),
    ai: u8((r) => r.ai ?? 0), grade: u8((r) => r.grade ?? 1), usable: u8(() => 1), clean: u8(() => 1),
    metrics: { m: Float32Array.from(rows.map((r) => r.v ?? NaN)) },
  };
}

const ALL = { fac: [0, 1], yearFrom: 2006, yearTo: 2026, langs: [0], ai: [1, 2, 3, 4] };

describe('filterMask', () => {
  const t = makeTheses([
    { fac: 0, year: 2010 }, { fac: 1, year: 2010 },
    { fac: 0, year: 2024, ai: 1 }, { fac: 0, year: 2024, ai: 2 }, { fac: 0, year: 2024, ai: 0 },
    { fac: 0, year: 2010, lang: 1 },
  ]);
  it('filters by faculty, year and language', () => {
    expect(countMask(filterMask(t, ALL))).toBe(5);
    expect(countMask(filterMask(t, { ...ALL, fac: [1] }))).toBe(1);
    expect(countMask(filterMask(t, { ...ALL, yearTo: 2020 }))).toBe(2);
    expect(countMask(filterMask(t, { ...ALL, langs: [0, 1] }))).toBe(6);
  });
  it('AI filter only narrows 2023+ rows', () => {
    const m = filterMask(t, { ...ALL, ai: [1] });
    expect(Array.from(m)).toEqual([1, 1, 1, 0, 0, 0]);
  });
});

describe('metricSeries', () => {
  it('computes thesis-weighted means and drops small cells', () => {
    const rows = [
      ...Array.from({ length: 20 }, () => ({ fac: 0, year: 2010, v: 2 })),
      ...Array.from({ length: 30 }, () => ({ fac: 1, year: 2010, v: 4 })),
      ...Array.from({ length: 5 }, () => ({ fac: 1, year: 2011, v: 9 })),
    ];
    const t = makeTheses(rows);
    const s = metricSeries(t, filterMask(t, ALL), 'm', [0, 1], 2010, 2011);
    expect(s.byFac.get(0)![0].mean).toBeCloseTo(2);
    expect(s.byFac.get(1)!.length).toBe(1); // 2011 has n=5 < 20
    expect(s.overall[0].mean).toBeCloseTo((20 * 2 + 30 * 4) / 50);
    expect(s.overall.length).toBe(1);
  });
});

describe('gradesByYear', () => {
  it('counts grades per year', () => {
    const t = makeTheses([{ fac: 0, year: 2010, grade: 1 }, { fac: 0, year: 2010, grade: 4 }, { fac: 1, year: 2011, grade: 2 }]);
    const g = gradesByYear(t, filterMask(t, ALL), 2010, 2011);
    expect(g[0].counts).toEqual([1, 0, 0, 1]);
    expect(g[1].total).toBe(1);
  });
});

describe('excess vocabulary', () => {
  it('fits a line', () => {
    const f = fitLine([1, 2, 3], [2, 4, 6])!;
    expect(f.slope).toBeCloseTo(2);
    expect(f.intercept).toBeCloseTo(0);
  });

  it('scores a word that jumps above its trend', () => {
    // 100 theses per year in faculty 0, 2018..2024. Word "x" used by 10 % until 2022, 40 % in 2023.
    const rows: { fac: number; year: number; ai?: number }[] = [];
    for (let y = 2018; y <= 2024; y++) for (let i = 0; i < 100; i++) rows.push({ fac: 0, year: y, ai: y >= 2023 ? 4 : 0 });
    const t = makeTheses(rows);
    const meta = { lang: 'cs', words: ['x', 'y'], cells: 2 * 17 + 2 * 4 * 5, preYears: 17, postYears: 4, aiValues: 5, faculties: 2 };
    const counts = new Uint16Array(meta.words.length * meta.cells);
    const cube: WordCube = { meta, langIndex: 0, lemma: false, counts, index: new Map([['x', 0], ['y', 1]]) };
    for (let y = 2018; y <= 2022; y++) counts[0 * meta.cells + cellIndex(cube, t, 0, y, 0)] = 10;
    counts[0 * meta.cells + cellIndex(cube, t, 0, 2023, 4)] = 40;
    for (let y = 2018; y <= 2022; y++) counts[1 * meta.cells + cellIndex(cube, t, 0, y, 0)] = 30;
    counts[1 * meta.cells + cellIndex(cube, t, 0, 2023, 4)] = 30;
    const f = { ...ALL, fac: [0] };
    const ctx = buildWordContext(t, cube, f, false);
    const r = scoreWords(cube, ctx, { from: 2023, to: 2023, base: 5 }, 0.01);
    expect(r.baseline).toEqual([2018, 2019, 2020, 2021, 2022]);
    const x = r.scores.find((s) => s.word === 'x')!;
    expect(x.observed).toBeCloseTo(0.4);
    expect(x.expected).toBeCloseTo(0.1);
    expect(x.score).toBeGreaterThan(1.9);
    const y = r.scores.find((s) => s.word === 'y')!;
    expect(Math.abs(y.score)).toBeLessThan(0.01);
    const ramp = rampFor([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, x.score]);
    expect(rampStep(x.score, ramp)).toBe(4);
    expect(rampStep(0.1, ramp)).toBe(0);

    // block 2023–2024 (2024 has no uses of x): pooled observed = 40/200, expected ≈ 0.1
    const b = scoreWords(cube, ctx, { from: 2023, to: 2024, base: 5 }, 0.01);
    const xb = b.scores.find((s) => s.word === 'x')!;
    expect(b.targetTotal).toBe(200);
    expect(xb.observed).toBeCloseTo(0.2);
    expect(xb.expected).toBeCloseTo(0.1);
    // a 3-year baseline uses 2020–2022 only
    expect(scoreWords(cube, ctx, { from: 2023, to: 2023, base: 3 }, 0.01).baseline).toEqual([2020, 2021, 2022]);
  });

  it('clamps comparisons into valid ranges', () => {
    expect(clampComparison({ from: 2007, to: 2005, base: 5 }, 2006, 2026)).toEqual({ from: 2009, to: 2009, base: 3 });
    expect(clampComparison({ from: 2023, to: 2030, base: 12 }, 2006, 2026)).toEqual({ from: 2023, to: 2026, base: 8 });
  });

  it('reports a target year too early for a baseline', () => {
    const t = makeTheses([{ fac: 0, year: 2008 }]);
    const meta = { lang: 'cs', words: ['x'], cells: 2 * 17 + 2 * 4 * 5, preYears: 17, postYears: 4, aiValues: 5, faculties: 2 };
    const cube: WordCube = { meta, langIndex: 0, lemma: false, counts: new Uint16Array(meta.cells), index: new Map([['x', 0]]) };
    const ctx = buildWordContext(t, cube, { ...ALL, fac: [0] }, false);
    expect(scoreWords(cube, ctx, { from: 2008, to: 2008, base: 5 }, 0.01).reason).toBe('too-early');
  });
});

describe('url state', () => {
  const d: Domain = { facCodes: ['a', 'b', 'c'], langs: ['cs', 'en', 'sk', 'other'], yearMin: 2006, yearMax: 2026, metrics: ['m1', 'm2'] };
  it('round-trips', () => {
    const s = { ...defaults(d), view: 'grades' as const, locale: 'cs' as const, fac: [0, 2], yearFrom: 2010, yearTo: 2024,
      langs: [0, 1], ai: [1], metric: 'm2', word: 'čeština', wordLang: 1, minFreq: 0.02, wordFrom: 2023, wordTo: 2025, wordBase: 4, lemma: false, gradeYear: 2020,
      brushes: { mattr: [0.7, 0.75] as [number, number] }, table: { trends: true } };
    expect(decode(encode(s, d), d)).toEqual(s);
  });
  it('defaults encode to an empty query and junk is ignored', () => {
    expect(encode(defaults(d), d)).toBe('');
    expect(decode('v=nope&y=3000-1&m=zzz&gy=abc', d)).toEqual(defaults(d));
  });
});

import { gradeShift, magnitude, metricShift } from './answers';

describe('answer lines', () => {
  it('measures a before/after shift and counts faculties that rose', () => {
    const rows: { fac: number; year: number; v: number; grade?: number }[] = [];
    for (let i = 0; i < 40; i++) {
      rows.push({ fac: 0, year: 2020, v: 1 + (i % 2) * 0.2, grade: i < 20 ? 1 : 2 });
      rows.push({ fac: 0, year: 2024, v: 1.3 + (i % 2) * 0.2, grade: i < 30 ? 1 : 4 });
      rows.push({ fac: 1, year: 2020, v: 2, grade: 1 });
      rows.push({ fac: 1, year: 2024, v: 1.9, grade: 1 });
    }
    const t = makeTheses(rows);
    const m = filterMask(t, ALL);
    const s = metricShift(t, m, 'm', 2025)!;
    expect(s.pre).toBeCloseTo(1.55);
    expect(s.post).toBeCloseTo(1.65);
    expect(s.facCompared).toBe(2);
    expect(s.facUp).toBe(1);
    const g = gradeShift(t, m, 2025)!;
    expect(g.pre[0]).toBeCloseTo(60 / 80);
    expect(g.post[1]).toBeCloseTo(10 / 80);
    expect(magnitude(0.01)).toBe('none');
    expect(magnitude(0.16)).toBe('slight');
    expect(magnitude(-0.7)).toBe('strong');
  });
  it('returns null when a window has no data', () => {
    const t = makeTheses([{ fac: 0, year: 2010, v: 1 }]);
    expect(metricShift(t, filterMask(t, ALL), 'm', 2025)).toBeNull();
  });
});
