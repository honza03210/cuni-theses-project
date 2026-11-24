import { describe, expect, it } from 'vitest';
import { filterMask, countMask } from './select';
import { gradesByYear, metricSeries } from './aggregate';
import { buildWordContext, cellIndex, clampComparison, wordCounts, fitLine, isNoise, rampFor, rampStep, scoreWords, topMovers } from './excess';
import { decode, encode, defaults, type Domain } from '../state/url';
import type { Theses, WordCube } from './types';
import { MISSING, shareAtLeast, wilson } from './playground';

// Tiny synthetic table: 2 faculties, years 2006..2026, 1 language.
function makeTheses(rows: { fac: number; year: number; lang?: number; ai?: number; gender?: number; grade?: number; v?: number }[]): Theses {
  const n = rows.length;
  const u8 = (f: (r: (typeof rows)[number]) => number) => Uint8Array.from(rows.map(f));
  return {
    meta: {
      rows: n, yearMin: 2006, yearMax: 2026, aiYear: 2023, columns: [],
      faculties: [{ code: 'a', abbr: 'A', name: { cs: 'A', en: 'A' } }, { code: 'b', abbr: 'B', name: { cs: 'B', en: 'B' } }],
      langs: ['cs', 'en', 'sk', 'other'], aiValues: ['n/a', 'u', 'nu', 't', 'ns'], genders: ['unknown', 'female', 'male'],
      metrics: [{ key: 'm', label: { cs: '', en: '' }, unit: { cs: '', en: '' }, desc: { cs: '', en: '' }, decimals: 2, p01: 0, p99: 10 }],
    },
    n,
    fac: u8((r) => r.fac), year: u8((r) => r.year - 2006), lang: u8((r) => r.lang ?? 0),
    ai: u8((r) => r.ai ?? 0), gender: u8((r) => r.gender ?? 0), grade: u8((r) => r.grade ?? 1), usable: u8(() => 1), clean: u8(() => 1),
    metrics: { m: Float32Array.from(rows.map((r) => r.v ?? NaN)) },
  };
}

const ALL = { fac: [0, 1], yearFrom: 2006, yearTo: 2026, langs: [0], ai: [1, 2, 3, 4], genders: [0, 1, 2], grades: [0, 1, 2, 3, 4] };

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
  it('grade filter keeps only the selected grades', () => {
    const g = makeTheses([{ fac: 0, year: 2010, grade: 1 }, { fac: 0, year: 2024, grade: 4 }, { fac: 0, year: 2010, grade: 0 }]);
    expect(Array.from(filterMask(g, { ...ALL, grades: [1, 2] }))).toEqual([1, 0, 0]);
    expect(Array.from(filterMask(g, { ...ALL, grades: [4, 0] }))).toEqual([0, 1, 1]);
  });
  it('gender filter narrows every year', () => {
    const g = makeTheses([{ fac: 0, year: 2010, gender: 1 }, { fac: 0, year: 2024, gender: 2 }, { fac: 0, year: 2010, gender: 0 }]);
    expect(Array.from(filterMask(g, { ...ALL, genders: [1] }))).toEqual([1, 0, 0]);
    expect(Array.from(filterMask(g, { ...ALL, genders: [2, 0] }))).toEqual([0, 1, 1]);
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
    const meta = { lang: 'cs', words: ['xx', 'yy'], cells: 2 * 17 + 2 * 4 * 5, preYears: 17, postYears: 4, aiValues: 5, faculties: 2 };
    const counts = new Uint16Array(meta.words.length * meta.cells);
    const cube: WordCube = { meta, langIndex: 0, lemma: false, counts, index: new Map([['xx', 0], ['yy', 1]]) };
    for (let y = 2018; y <= 2022; y++) counts[0 * meta.cells + cellIndex(cube, t, 0, y, 0)] = 10;
    counts[0 * meta.cells + cellIndex(cube, t, 0, 2023, 4)] = 40;
    for (let y = 2018; y <= 2022; y++) counts[1 * meta.cells + cellIndex(cube, t, 0, y, 0)] = 30;
    counts[1 * meta.cells + cellIndex(cube, t, 0, 2023, 4)] = 30;
    const f = { ...ALL, fac: [0] };
    const ctx = buildWordContext(t, cube, f, false);
    const r = scoreWords(cube, ctx, { from: 2023, to: 2023, base: 5 }, 0.01);
    expect(r.baseline).toEqual([2018, 2019, 2020, 2021, 2022]);
    const x = r.scores.find((s) => s.word === 'xx')!;
    expect(x.observed).toBeCloseTo(0.4);
    expect(x.expected).toBeCloseTo(0.1);
    expect(x.score).toBeGreaterThan(1.9);
    const y = r.scores.find((s) => s.word === 'yy')!;
    expect(Math.abs(y.score)).toBeLessThan(0.01);
    const ramp = rampFor([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, x.score]);
    expect(rampStep(x.score, ramp)).toBe(4);
    expect(rampStep(0.1, ramp)).toBe(0);
    expect(x.gap).toBeCloseTo(0.3);

    // block 2023–2024 (2024 has no uses of x): pooled observed = 40/200, expected ≈ 0.1
    const b = scoreWords(cube, ctx, { from: 2023, to: 2024, base: 5 }, 0.01);
    const xb = b.scores.find((s) => s.word === 'xx')!;
    expect(b.targetTotal).toBe(200);
    expect(xb.observed).toBeCloseTo(0.2);
    expect(xb.expected).toBeCloseTo(0.1);
    // a 3-year baseline uses 2020–2022 only
    expect(scoreWords(cube, ctx, { from: 2023, to: 2023, base: 3 }, 0.01).baseline).toEqual([2020, 2021, 2022]);
  });

  it('ranks movers by absolute gap or by ratio', () => {
    const mk = (word: string, observed: number, expected: number) =>
      ({ word, wi: 0, observed, expected, gap: observed - expected, score: Math.log2((observed + 0.001) / (expected + 0.001)), docs: 0, fit: { slope: 0, intercept: 0 } });
    const common = mk('klíčový', 0.67, 0.49);  // +18 pp, 1.37×
    const rare = mk('zprava', 0.03, 0.01);      // +2 pp, ~2.8×
    const falls = mk('covid', 0.02, 0.10);
    expect(topMovers([rare, common, falls], 5, 'gap').rising.map((s) => s.word)).toEqual(['klíčový', 'zprava']);
    expect(topMovers([rare, common, falls], 5, 'ratio').rising.map((s) => s.word)).toEqual(['zprava', 'klíčový']);
    expect(topMovers([rare, common, falls], 5, 'gap').falling.map((s) => s.word)).toEqual(['covid']);
  });

  it('treats fragments and link debris as noise', () => {
    expect(isNoise('á')).toBe(true);
    expect(isNoise('https')).toBe(true);
    expect(isNoise('ai')).toBe(false);
    expect(isNoise('klíčový')).toBe(false);
  });

  it('clamps comparisons into valid ranges', () => {
    expect(clampComparison({ from: 2007, to: 2005, base: 5 }, 2006, 2026)).toEqual({ from: 2009, to: 2009, base: 3 });
    expect(clampComparison({ from: 2023, to: 2030, base: 12 }, 2006, 2026)).toEqual({ from: 2023, to: 2026, base: 8 });
  });

  it('reports a target year too early for a baseline', () => {
    const t = makeTheses([{ fac: 0, year: 2008 }]);
    const meta = { lang: 'cs', words: ['xx'], cells: 2 * 17 + 2 * 4 * 5, preYears: 17, postYears: 4, aiValues: 5, faculties: 2 };
    const cube: WordCube = { meta, langIndex: 0, lemma: false, counts: new Uint16Array(meta.cells), index: new Map([['xx', 0]]) };
    const ctx = buildWordContext(t, cube, { ...ALL, fac: [0] }, false);
    expect(scoreWords(cube, ctx, { from: 2008, to: 2008, base: 5 }, 0.01).reason).toBe('too-early');
  });

  it('sums only the selected genders in a gendered cube', () => {
    const t = makeTheses([{ fac: 0, year: 2010 }]);
    const per = 2 * 17 + 2 * 4 * 5;
    const meta = { lang: 'cs', words: ['xx'], cells: 3 * per, preYears: 17, postYears: 4, aiValues: 5, faculties: 2, genders: 3 };
    const cube: WordCube = { meta, langIndex: 0, lemma: false, counts: new Uint16Array(meta.cells), index: new Map([['xx', 0]]) };
    expect(cellIndex(cube, t, 1, 2024, 3, 2)).toBe(2 * per + 2 * 17 + (1 * 4 + 1) * 5 + 3);
    cube.counts[cellIndex(cube, t, 0, 2010, 0, 1)] = 7;
    cube.counts[cellIndex(cube, t, 0, 2010, 0, 2)] = 5;
    const yi = 2010 - 2006;
    expect(wordCounts(cube, buildWordContext(t, cube, { ...ALL, fac: [0] }, false), 0)[0][yi]).toBe(12);
    expect(wordCounts(cube, buildWordContext(t, cube, { ...ALL, fac: [0], genders: [2] }, false), 0)[0][yi]).toBe(5);
  });
});

describe('url state', () => {
  const d: Domain = { facCodes: ['a', 'b', 'c'], langs: ['cs', 'en', 'sk', 'other'], yearMin: 2006, yearMax: 2026, metrics: ['m1', 'm2'] };
  it('round-trips', () => {
    const s = { ...defaults(d), view: 'grades' as const, locale: 'cs' as const, detailed: true, fac: [0, 2], yearFrom: 2010, yearTo: 2024,
      langs: [0, 1], ai: [1], genders: [1], grades: [1, 4], metric: 'm2', word: 'čeština', wordLang: 1, minFreq: 0.02, wordFrom: 2023, wordTo: 2025, wordBase: 4, lemma: false, wordRank: 'ratio' as const, gradeYear: 2020, zoom: [2013, 2018] as [number, number],
      brushes: { mattr: [0.7, 0.75] as [number, number] }, table: { trends: true } };
    expect(decode(encode(s, d), d)).toEqual(s);
  });
  it('defaults encode to an empty query and junk is ignored', () => {
    expect(encode(defaults(d), d)).toBe('');
    expect(decode('v=nope&y=3000-1&m=zzz&gy=abc&z=2020-2010', d)).toEqual(defaults(d));
  });
});

import { dataSpan, gradeShift, magnitude, metricShift } from './answers';

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
    // faculty 0 rose by 0.3 (spread 0.1), faculty 1 fell 2.0 -> 1.9 with no spread: both beyond chance
    expect(s.facSigUp).toBe(1);
    expect(s.facSigDown).toBe(1);
    const g = gradeShift(t, m, 2025)!;
    expect(g.pre[0]).toBeCloseTo(60 / 80);
    expect(g.post[1]).toBeCloseTo(10 / 80);
    expect(g.same).toBe(false);
    // a 0.1 shift against a spread of ~0.45 with 80 + 80 theses is within chance
    expect(s.clear).toBe(false);
    // excellent share 75 % -> 87.5 % with 80 + 80 theses is beyond its 95 % interval
    expect(g.clear).toBe(true);
    // only 2024 holds post-window data, so the label names 2024, not 2023–2025
    expect(s.postSpan).toBe('2024');
    expect(g.postSpan).toBe('2024');
    expect(magnitude(0.01)).toBe('none');
    expect(magnitude(0.16)).toBe('slight');
    expect(magnitude(-0.7)).toBe('strong');
  });
  it('flags a change that sits in the last year alone', () => {
    const rows: { fac: number; year: number; v: number }[] = [];
    for (let i = 0; i < 40; i++) {
      rows.push({ fac: 0, year: 2020, v: 1 + (i % 2) * 0.2 });
      rows.push({ fac: 0, year: 2023, v: 1 + (i % 2) * 0.2 });
      rows.push({ fac: 0, year: 2025, v: 2 + (i % 2) * 0.2 });
    }
    const t = makeTheses(rows);
    const s = metricShift(t, filterMask(t, ALL), 'm', 2025)!;
    expect(s.clear).toBe(true);
    expect(s.step?.lateYear).toBe(2025);
    expect(s.step?.early).toBeCloseTo(1.1);
    expect(s.step?.earlySpan).toBe('2023–2024');
  });
  it('labels only the years that hold enough theses', () => {
    const n: Record<number, number> = { 2023: 3, 2024: 25, 2025: 40 };
    expect(dataSpan((y) => n[y] ?? 0, 2023, 2025)).toBe('2024–2025');
    expect(dataSpan((y) => n[y] ?? 0, 2023, 2023)).toBeNull();
  });
  it('returns null when a window has no data', () => {
    const t = makeTheses([{ fac: 0, year: 2010, v: 1 }]);
    expect(metricShift(t, filterMask(t, ALL), 'm', 2025)).toBeNull();
  });
});

describe('chart zoom', async () => {
  const { zoom, zoomed, resetZoom } = await import('../state/zoom.svelte');
  it('narrows a chart to the zoomed years and ignores a zoom outside them', () => {
    expect(zoomed(2006, 2025)).toEqual([2006, 2025]);
    zoom.range = [2015, 2020];
    expect(zoomed(2006, 2025)).toEqual([2015, 2020]);
    expect(zoomed(2018, 2025)).toEqual([2018, 2020]);
    expect(zoomed(2021, 2025)).toEqual([2021, 2025]);
    resetZoom();
    expect(zoom.range).toBeNull();
  });
  it('turns the zoom into the year filter', async () => {
    const { app } = await import('../state/app.svelte');
    const { applyZoom } = await import('../state/zoom.svelte');
    zoom.range = [2012, 2019];
    applyZoom();
    expect([app.yearFrom, app.yearTo]).toEqual([2012, 2019]);
    expect(zoom.range).toBeNull();
  });
});

describe('shareAtLeast', () => {
  it('counts theses with at least n, skips missing rows and small years', () => {
    const rows = [...Array(20)].map((_, i) => ({ fac: i % 2, year: 2010 })).concat([{ fac: 0, year: 2011 }]);
    const t = makeTheses(rows);
    const counts = Uint16Array.from(rows.map((_, i) => (i < 5 ? 3 : i < 8 ? 2 : 0)));
    const pts = shareAtLeast(t, counts, 3, 0, null);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ year: 2010, k: 5, n: 20, share: 0.25 });
    expect(shareAtLeast(t, counts, 2, 0, null)[0].k).toBe(8);
    counts[0] = MISSING;
    expect(shareAtLeast(t, counts, 3, 0, null)).toHaveLength(0); // 19 < MIN_CELL_N
    expect(shareAtLeast(t, counts, 3, 1, null)).toHaveLength(0); // other language
  });
  it('wilson interval brackets the share', () => {
    const [lo, hi] = wilson(5, 20);
    expect(lo).toBeLessThan(0.25); expect(hi).toBeGreaterThan(0.25);
    expect(wilson(0, 50)[0]).toBe(0);
  });
});
