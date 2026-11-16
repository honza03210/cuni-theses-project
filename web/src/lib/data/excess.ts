import { filterMask } from './select';
import type { Filters, Theses, WordCube } from './types';

export const BASELINE_YEARS = 5;
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
export function cellIndex(cube: WordCube, t: Theses, fac: number, year: number, ai: number): number {
  const m = cube.meta;
  if (year < t.meta.aiYear) return fac * m.preYears + (year - t.meta.yearMin);
  const base = m.faculties * m.preYears;
  return base + (fac * m.postYears + (year - t.meta.aiYear)) * m.aiValues + ai;
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
  const cells = f.fac.map((fac) => {
    const perYear: number[][] = [];
    for (let yi = 0; yi < ny; yi++) {
      const year = yearMin + yi;
      perYear.push(year < aiYear ? [cellIndex(cube, t, fac, year, 0)]
                                 : aiList.map((a) => cellIndex(cube, t, fac, year, a)));
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
  observed: number;   // share of theses in target year
  expected: number;   // trend extrapolated to target year
  score: number;      // log2((observed+eps)/(expected+eps))
  docs: number;       // theses using it in target year
  fit: LinearFit;
}

export interface ScoreResult {
  target: number;
  baseline: number[];          // years used for the fit
  targetTotal: number;         // theses in target year
  scores: WordScore[];         // all words passing the min-frequency filter
  reason?: 'too-early' | 'no-target' | 'thin-baseline';
}

/** Score every word: observed share in `target` vs the linear trend fitted on the
 *  BASELINE_YEARS before it. */
export function scoreWords(cube: WordCube, ctx: WordContext, target: number, minFreq: number): ScoreResult {
  const ti = target - ctx.yearMin;
  const baseline: number[] = [];
  for (let y = target - BASELINE_YEARS; y < target; y++) {
    if (y >= ctx.yearMin && ctx.total[y - ctx.yearMin] > 0) baseline.push(y);
  }
  const res: ScoreResult = { target, baseline, targetTotal: ctx.total[ti] ?? 0, scores: [] };
  if (target - BASELINE_YEARS < ctx.yearMin) { res.reason = 'too-early'; return res; }
  if (!res.targetTotal) { res.reason = 'no-target'; return res; }
  if (baseline.length < 3) { res.reason = 'thin-baseline'; return res; }

  // flatten cells per relevant year
  const yearsUsed = [...baseline, target];
  const flat = yearsUsed.map((y) => ctx.cells.flatMap((perYear) => perYear[y - ctx.yearMin]));
  const denoms = yearsUsed.map((y) => ctx.total[y - ctx.yearMin]);
  const nb = baseline.length;
  const C = cube.meta.cells;
  const shares = new Array<number>(nb);
  for (let wi = 0; wi < cube.meta.words.length; wi++) {
    const row = wi * C;
    let docsT = 0;
    for (let k = 0; k <= nb; k++) {
      let s = 0;
      for (const c of flat[k]) s += cube.counts[row + c];
      if (k < nb) shares[k] = s / denoms[k];
      else docsT = s;
    }
    const fit = fitLine(baseline, shares);
    if (!fit) continue;
    const observed = docsT / res.targetTotal;
    const expected = Math.max(0, fit.intercept + fit.slope * target);
    if (Math.max(observed, expected) < minFreq) continue;
    const score = Math.log2((observed + EPS) / (expected + EPS));
    res.scores.push({ word: cube.meta.words[wi], wi, observed, expected, score, docs: docsT, fit });
  }
  return res;
}

export function topMovers(scores: WordScore[], n: number, minAbs = 0.15) {
  const rising = scores.filter((s) => s.score >= minAbs).sort((a, b) => b.score - a.score).slice(0, n);
  const falling = scores.filter((s) => s.score <= -minAbs).sort((a, b) => a.score - b.score).slice(0, n);
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
