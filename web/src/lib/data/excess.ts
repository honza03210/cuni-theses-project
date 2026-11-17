import { filterMask } from './select';
import type { Filters, Theses, WordCube } from './types';

export const BASELINE_YEARS = 5;   // default baseline length
/** Smoothing for log ratios: 0.1 % of theses */
export const EPS = 0.001;

export interface WordContext {
  yearMin: number;
  yearMax: number;
  facs: number[];
  /** cells[fi][yi]: cube cell indices for selected faculty fi (position in facs), year yearMin+yi */
  cells: number[][][];
  /** denom[fi][yi]: usable theses in that faculty/year matching the filters and the cube's language */
  denom: number[][];
  /** total denominator per year (all selected faculties) */
  total: number[];
}

/** Cube cell layout, mirrored from pipeline/build.py */
export function cellIndex(cube: WordCube, t: Theses, fac: number, year: number, ai: number, gender = 0): number {
  const m = cube.meta;
  const base = m.faculties * m.preYears;
  const g = gender * (base + m.faculties * m.postYears * m.aiValues);
  if (year < t.meta.aiYear) return g + fac * m.preYears + (year - t.meta.yearMin);
  return g + base + (fac * m.postYears + (year - t.meta.aiYear)) * m.aiValues + ai;
}

export function buildWordContext(t: Theses, cube: WordCube, f: Filters, aiOn: boolean): WordContext {
  const { yearMin, yearMax, aiYear } = t.meta;
  const ny = yearMax - yearMin + 1;
  // Denominators cover every year (the baseline may precede the selected range)
  const mask = filterMask(t, { ...f, yearFrom: yearMin, yearTo: yearMax, langs: [cube.langIndex] });
  const pos = new Map(f.fac.map((fac, i) => [fac, i]));
  const denom = f.fac.map(() => new Array<number>(ny).fill(0));
  for (let i = 0; i < t.n; i++) {
    if (!mask[i] || !t.usable[i]) continue;
    const fi = pos.get(t.fac[i]);
    if (fi !== undefined) denom[fi][t.year[i]]++;
  }
  const aiList = aiOn ? f.ai : [0, 1, 2, 3, 4];
  const gList = (cube.meta.genders ?? 1) > 1 ? f.genders : [0];
  const cells = f.fac.map((fac) => {
    const perYear: number[][] = [];
    for (let yi = 0; yi < ny; yi++) {
      const year = yearMin + yi;
      perYear.push(gList.flatMap((g) => year < aiYear ? [cellIndex(cube, t, fac, year, 0, g)]
                                                     : aiList.map((a) => cellIndex(cube, t, fac, year, a, g))));
    }
    return perYear;
  });
  const total = new Array<number>(ny).fill(0);
  for (const d of denom) for (let yi = 0; yi < ny; yi++) total[yi] += d[yi];
  return { yearMin, yearMax, facs: f.fac, cells, denom, total };
}

/** Number of theses using word `wi` (≥ 2×) per selected faculty and year: [fi][yi] */
export function wordCounts(cube: WordCube, ctx: WordContext, wi: number): number[][] {
  const row = wi * cube.meta.cells;
  return ctx.cells.map((perYear) => perYear.map((cs) => {
    let s = 0;
    for (const c of cs) s += cube.counts[row + c];
    return s;
  }));
}

export interface LinearFit { slope: number; intercept: number }

export function fitLine(xs: number[], ys: number[]): LinearFit | null {
  const n = xs.length;
  if (n < 2) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

export interface WordScore {
  word: string;
  wi: number;
  observed: number;   // pooled share of theses over the target years
  expected: number;   // trend extrapolated to the target years (thesis-weighted)
  score: number;      // log2((observed+eps)/(expected+eps)): relative change
  gap: number;        // observed - expected: absolute change in share of theses
  docs: number;       // theses using it in the target years
  fit: LinearFit;
}

export interface Comparison {
  from: number;       // first target year
  to: number;         // last target year (from === to: a single year)
  base: number;       // number of baseline years right before `from`
}

export const BASE_MIN = 3;

/** Tokens that are not vocabulary: single letters, link and citation debris. */
const NOISE = new Set(['http', 'https', 'www', 'doi', 'isbn', 'issn', 'vyd', 'rozš', 'et', 'al', 'pp', 'tab', 'obr']);
export const isNoise = (w: string) => w.length < 2 || NOISE.has(w);
export const BASE_MAX = 8;

export interface ScoreResult {
  from: number;
  to: number;
  baseline: number[];          // years used for the fit
  targetTotal: number;         // theses in the target years
  scores: WordScore[];         // all words passing the min-frequency filter
  reason?: 'too-early' | 'no-target' | 'thin-baseline';
}

/** Score every word: its pooled share over the target years [from, to] against the
 *  linear trend fitted on the `base` years before `from`, extrapolated to each target
 *  year and weighted by that year's thesis count. */
export function scoreWords(cube: WordCube, ctx: WordContext, cmp: Comparison, minFreq: number): ScoreResult {
  const { from, to, base } = cmp;
  const baseline: number[] = [];
  for (let y = from - base; y < from; y++) {
    if (y >= ctx.yearMin && ctx.total[y - ctx.yearMin] > 0) baseline.push(y);
  }
  const targets: number[] = [];
  for (let y = from; y <= to; y++) if (y <= ctx.yearMax && ctx.total[y - ctx.yearMin] > 0) targets.push(y);
  const tTot = targets.map((y) => ctx.total[y - ctx.yearMin]);
  const targetTotal = tTot.reduce((a, b) => a + b, 0);
  const res: ScoreResult = { from, to, baseline, targetTotal, scores: [] };
  if (from - base < ctx.yearMin) { res.reason = 'too-early'; return res; }
  if (!targetTotal) { res.reason = 'no-target'; return res; }
  if (baseline.length < BASE_MIN) { res.reason = 'thin-baseline'; return res; }

  const flatB = baseline.map((y) => ctx.cells.flatMap((perYear) => perYear[y - ctx.yearMin]));
  const denB = baseline.map((y) => ctx.total[y - ctx.yearMin]);
  const flatT = targets.map((y) => ctx.cells.flatMap((perYear) => perYear[y - ctx.yearMin]));
  const nb = baseline.length;
  const C = cube.meta.cells;
  const shares = new Array<number>(nb);
  for (let wi = 0; wi < cube.meta.words.length; wi++) {
    if (isNoise(cube.meta.words[wi])) continue;
    const row = wi * C;
    for (let k = 0; k < nb; k++) {
      let s = 0;
      for (const c of flatB[k]) s += cube.counts[row + c];
      shares[k] = s / denB[k];
    }
    const fit = fitLine(baseline, shares);
    if (!fit) continue;
    let docs = 0, expDocs = 0;
    for (let k = 0; k < targets.length; k++) {
      let s = 0;
      for (const c of flatT[k]) s += cube.counts[row + c];
      docs += s;
      expDocs += Math.max(0, fit.intercept + fit.slope * targets[k]) * tTot[k];
    }
    const observed = docs / targetTotal;
    const expected = expDocs / targetTotal;
    if (Math.max(observed, expected) < minFreq) continue;
    const score = Math.log2((observed + EPS) / (expected + EPS));
    res.scores.push({ word: cube.meta.words[wi], wi, observed, expected, score, gap: observed - expected, docs, fit });
  }
  return res;
}

/** Keep a comparison valid: from <= to inside the data, baseline of BASE_MIN..BASE_MAX
 *  years that fits before `from`. */
export function clampComparison(c: Comparison, yearMin: number, yearMax: number): Comparison {
  let from = Math.max(yearMin + BASE_MIN, Math.min(yearMax, Math.round(c.from)));
  let to = Math.max(from, Math.min(yearMax, Math.round(c.to)));
  const base = Math.max(BASE_MIN, Math.min(BASE_MAX, Math.round(c.base), from - yearMin));
  return { from, to, base };
}

/** How words are ranked and sized:
 *  'gap'   - absolute change in share of theses (percentage points): favours widely used words
 *            whose use grew a lot (e.g. klíčový 49 % → 67 %);
 *  'ratio' - relative change (observed ÷ expected): surfaces rare words that exploded. */
export type RankMode = 'gap' | 'ratio';

export const rankValue = (s: WordScore, mode: RankMode) => (mode === 'gap' ? s.gap : s.score);

/** Minimum change for a word to count as a mover: 0.2 pp of theses, or a 1.11× ratio. */
const MIN_MOVE: Record<RankMode, number> = { gap: 0.002, ratio: 0.15 };

export function topMovers(scores: WordScore[], n: number, mode: RankMode = 'gap') {
  const v = (s: WordScore) => rankValue(s, mode);
  const min = MIN_MOVE[mode];
  const rising = scores.filter((s) => v(s) >= min).sort((a, b) => v(b) - v(a)).slice(0, n);
  const falling = scores.filter((s) => v(s) <= -min).sort((a, b) => v(a) - v(b)).slice(0, n);
  return { rising, falling };
}

/** 5-step magnitude ramp: thresholds at quantiles of |score| of the shown words,
 *  so the steps always spread across what is on screen. Returns 5 lower bounds. */
export function rampFor(scores: number[]): number[] {
  const a = scores.map(Math.abs).sort((x, y) => x - y);
  if (!a.length) return [0, 0, 0, 0, 0];
  const q = (p: number) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  return [a[0], q(0.4), q(0.65), q(0.85), q(0.96)];
}
export function rampStep(score: number, ramp: number[]): number {
  const a = Math.abs(score);
  let s = 0;
  for (let i = 0; i < ramp.length; i++) if (a >= ramp[i]) s = i;
  return s;
}
