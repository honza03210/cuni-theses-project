import type { Theses } from './types';

/** Before/after-ChatGPT windows used by the answer lines. */
export const PRE: [number, number] = [2018, 2022];
export const POST_FROM = 2023;

export type Magnitude = 'none' | 'slight' | 'noticeable' | 'strong';

/** Size of a change in units of the pre-period spread (Cohen's d). */
export function magnitude(d: number): Magnitude {
  const a = Math.abs(d);
  return a < 0.05 ? 'none' : a < 0.2 ? 'slight' : a < 0.5 ? 'noticeable' : 'strong';
}

/** First and last year of [from, to] with at least `min` theses, as a label ("2025" or "2023–2025"). */
export function dataSpan(countByYear: (y: number) => number, from: number, to: number, min = 20): string | null {
  let a = 0, b = 0;
  for (let y = from; y <= to; y++) if (countByYear(y) >= min) { if (!a) a = y; b = y; }
  return a ? (a === b ? `${a}` : `${a}–${b}`) : null;
}

export interface MetricShift {
  pre: number;
  preN: number;
  postN: number;
  /** years of the post window that actually hold data (≥ 20 theses) */
  postSpan: string;
  post: number;
  postTo: number;      // last year in the post window
  d: number;           // standardised difference
  /** the 95 % interval of post − pre excludes zero (Welch); false = too few theses / too noisy to tell */
  clear: boolean;
  /** set when most of the shift sits in the last year alone: earlier post years stayed near `pre`
   *  while the last year (`lateYear`) differs from them beyond chance */
  step: { early: number; late: number; earlySpan: string; lateYear: number } | null;
  rel: number;         // relative change
  facUp: number;       // faculties whose mean rose
  facCompared: number; // faculties with enough theses in both windows
}

/** Pooled mean of a style metric before (2018–2022) and after (2023–postTo) ChatGPT,
 *  over the masked theses, plus how many faculties moved up. null if a window is empty. */
export function metricShift(t: Theses, mask: Uint8Array, metric: string, postTo: number, minN = 20): MetricShift | null {
  const v = t.metrics[metric];
  const nf = t.meta.faculties.length;
  const s = { pre: 0, preSq: 0, preN: 0, post: 0, postSq: 0, postN: 0 };
  const fPre = new Float64Array(nf), fPreN = new Uint32Array(nf), fPost = new Float64Array(nf), fPostN = new Uint32Array(nf);
  const perYear = new Map<number, number>();
  const ys = new Map<number, { s: number; q: number; n: number }>();
  for (let i = 0; i < t.n; i++) {
    if (!mask[i]) continue;
    const x = v[i];
    if (!Number.isFinite(x)) continue;
    const y = t.year[i] + t.meta.yearMin;
    const f = t.fac[i];
    if (y >= PRE[0] && y <= PRE[1]) { s.pre += x; s.preSq += x * x; s.preN++; fPre[f] += x; fPreN[f]++; }
    else if (y >= POST_FROM && y <= postTo) { s.post += x; s.postSq += x * x; s.postN++; fPost[f] += x; fPostN[f]++; perYear.set(y, (perYear.get(y) ?? 0) + 1);
      const a = ys.get(y) ?? { s: 0, q: 0, n: 0 }; a.s += x; a.q += x * x; a.n++; ys.set(y, a); }
  }
  if (s.preN < minN || s.postN < minN) return null;
  const pre = s.pre / s.preN, post = s.post / s.postN;
  const preVar = Math.max(1e-12, (s.preSq - s.preN * pre * pre) / (s.preN - 1));
  const postVar = Math.max(1e-12, (s.postSq - s.postN * post * post) / (s.postN - 1));
  const sd = Math.sqrt(preVar);
  const clear = Math.abs(post - pre) > 1.96 * Math.sqrt(preVar / s.preN + postVar / s.postN);
  let facUp = 0, facCompared = 0;
  for (let f = 0; f < nf; f++) {
    if (fPreN[f] >= minN && fPostN[f] >= minN) {
      facCompared++;
      if (fPost[f] / fPostN[f] > fPre[f] / fPreN[f]) facUp++;
    }
  }
  const postSpan = dataSpan((y) => perYear.get(y) ?? 0, POST_FROM, postTo) ?? `${POST_FROM}–${postTo}`;
  // Is the change concentrated in the last year? Compare the earlier post years with the last one.
  let step: MetricShift['step'] = null;
  if (postTo > POST_FROM) {
    const pool = (from: number, to: number) => {
      let sum = 0, sq = 0, n = 0;
      for (let y = from; y <= to; y++) { const a = ys.get(y); if (a) { sum += a.s; sq += a.q; n += a.n; } }
      return n >= minN ? { m: sum / n, v: Math.max(1e-12, (sq - n * (sum / n) ** 2) / (n - 1)), n } : null;
    };
    const e = pool(POST_FROM, postTo - 1), l = pool(postTo, postTo);
    if (e && l) {
      const apart = Math.abs(l.m - e.m) > 1.96 * Math.sqrt(e.v / e.n + l.v / l.n);
      const mostlyLate = Math.abs(e.m - pre) < Math.abs(l.m - pre) / 2;
      if (clear && apart && mostlyLate) {
        step = { early: e.m, late: l.m, earlySpan: postTo - 1 === POST_FROM ? `${POST_FROM}` : `${POST_FROM}–${postTo - 1}`, lateYear: postTo };
      }
    }
  }
  return { pre, post, preN: s.preN, postN: s.postN, postSpan, postTo, clear, step, d: (post - pre) / sd, rel: post / pre - 1, facUp, facCompared };
}

// [excellent, fail] shares; `same` = both shares moved by less than 1.5 percentage points
// `clear` = at least one share moved beyond its 95 % interval (two-proportion test)
export interface GradeShift { pre: [number, number]; post: [number, number]; postTo: number; postN: number; postSpan: string; same: boolean; clear: boolean }

export function gradeShift(t: Theses, mask: Uint8Array, postTo: number, minN = 20): GradeShift | null {
  const c = { pre: [0, 0, 0], post: [0, 0, 0] }; // [excellent, fail, total]
  const perYear = new Map<number, number>();
  for (let i = 0; i < t.n; i++) {
    if (!mask[i]) continue;
    const g = t.grade[i];
    if (g < 1 || g > 4) continue;
    const y = t.year[i] + t.meta.yearMin;
    const k = y >= PRE[0] && y <= PRE[1] ? c.pre : y >= POST_FROM && y <= postTo ? c.post : null;
    if (!k) continue;
    k[2]++;
    if (k === c.post) perYear.set(y, (perYear.get(y) ?? 0) + 1);
    if (g === 1) k[0]++;
    if (g === 4) k[1]++;
  }
  if (c.pre[2] < minN || c.post[2] < minN) return null;
  const pre: [number, number] = [c.pre[0] / c.pre[2], c.pre[1] / c.pre[2]];
  const post: [number, number] = [c.post[0] / c.post[2], c.post[1] / c.post[2]];
  const same = Math.abs(post[0] - pre[0]) < 0.015 && Math.abs(post[1] - pre[1]) < 0.015;
  const moved = (k: 0 | 1) => Math.abs(post[k] - pre[k]) > 1.96 * Math.sqrt(pre[k] * (1 - pre[k]) / c.pre[2] + post[k] * (1 - post[k]) / c.post[2]);
  const clear = moved(0) || moved(1);
  const postSpan = dataSpan((y) => perYear.get(y) ?? 0, POST_FROM, postTo) ?? `${POST_FROM}–${postTo}`;
  return { pre, post, postTo, postN: c.post[2], postSpan, same, clear };
}
