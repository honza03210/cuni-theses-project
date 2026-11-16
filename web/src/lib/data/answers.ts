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

export interface MetricShift {
  pre: number;
  post: number;
  postTo: number;      // last year in the post window
  d: number;           // standardised difference
  rel: number;         // relative change
  facUp: number;       // faculties whose mean rose
  facCompared: number; // faculties with enough theses in both windows
}

/** Pooled mean of a style metric before (2018–2022) and after (2023–postTo) ChatGPT,
 *  over the masked theses, plus how many faculties moved up. null if a window is empty. */
export function metricShift(t: Theses, mask: Uint8Array, metric: string, postTo: number, minN = 20): MetricShift | null {
  const v = t.metrics[metric];
  const nf = t.meta.faculties.length;
  const s = { pre: 0, preSq: 0, preN: 0, post: 0, postN: 0 };
  const fPre = new Float64Array(nf), fPreN = new Uint32Array(nf), fPost = new Float64Array(nf), fPostN = new Uint32Array(nf);
  for (let i = 0; i < t.n; i++) {
    if (!mask[i]) continue;
    const x = v[i];
    if (!Number.isFinite(x)) continue;
    const y = t.year[i] + t.meta.yearMin;
    const f = t.fac[i];
    if (y >= PRE[0] && y <= PRE[1]) { s.pre += x; s.preSq += x * x; s.preN++; fPre[f] += x; fPreN[f]++; }
    else if (y >= POST_FROM && y <= postTo) { s.post += x; s.postN++; fPost[f] += x; fPostN[f]++; }
  }
  if (s.preN < minN || s.postN < minN) return null;
  const pre = s.pre / s.preN, post = s.post / s.postN;
  const sd = Math.sqrt(Math.max(1e-12, (s.preSq - s.preN * pre * pre) / (s.preN - 1)));
  let facUp = 0, facCompared = 0;
  for (let f = 0; f < nf; f++) {
    if (fPreN[f] >= minN && fPostN[f] >= minN) {
      facCompared++;
      if (fPost[f] / fPostN[f] > fPre[f] / fPreN[f]) facUp++;
    }
  }
  return { pre, post, postTo, d: (post - pre) / sd, rel: post / pre - 1, facUp, facCompared };
}

export interface GradeShift { pre: [number, number]; post: [number, number]; postTo: number } // [excellent, fail] shares

export function gradeShift(t: Theses, mask: Uint8Array, postTo: number, minN = 20): GradeShift | null {
  const c = { pre: [0, 0, 0], post: [0, 0, 0] }; // [excellent, fail, total]
  for (let i = 0; i < t.n; i++) {
    if (!mask[i]) continue;
    const g = t.grade[i];
    if (g < 1 || g > 4) continue;
    const y = t.year[i] + t.meta.yearMin;
    const k = y >= PRE[0] && y <= PRE[1] ? c.pre : y >= POST_FROM && y <= postTo ? c.post : null;
    if (!k) continue;
    k[2]++;
    if (g === 1) k[0]++;
    if (g === 4) k[1]++;
  }
  if (c.pre[2] < minN || c.post[2] < minN) return null;
  return { pre: [c.pre[0] / c.pre[2], c.pre[1] / c.pre[2]], post: [c.post[0] / c.post[2], c.post[1] / c.post[2]], postTo };
}
