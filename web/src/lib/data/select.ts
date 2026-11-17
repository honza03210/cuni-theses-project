import type { Filters, Theses } from './types';

export const AI_ALL = [1, 2, 3, 4];
export const MIN_CELL_N = 20;
/** author gender codes in display order: female, male, unknown */
export const GENDER_ALL = [1, 2, 0];

export function aiFilterActive(ai: number[]): boolean {
  return !AI_ALL.every((v) => ai.includes(v));
}

/** Row mask for the filters. The AI-declaration filter only narrows rows from
 *  `aiYear` on; earlier years stay as the baseline. */
export function filterMask(t: Theses, f: Filters): Uint8Array {
  const mask = new Uint8Array(t.n);
  const facOk = new Uint8Array(256);
  for (const i of f.fac) facOk[i] = 1;
  const langOk = new Uint8Array(256);
  for (const i of f.langs) langOk[i] = 1;
  const aiOk = new Uint8Array(256);
  for (const i of f.ai) aiOk[i] = 1;
  const gOk = new Uint8Array(256);
  for (const i of f.genders) gOk[i] = 1;
  const aiOn = aiFilterActive(f.ai);
  const y0 = f.yearFrom - t.meta.yearMin;
  const y1 = f.yearTo - t.meta.yearMin;
  const aiY = t.meta.aiYear - t.meta.yearMin;
  for (let i = 0; i < t.n; i++) {
    const y = t.year[i];
    if (y < y0 || y > y1) continue;
    if (!facOk[t.fac[i]] || !langOk[t.lang[i]] || !gOk[t.gender[i]]) continue;
    if (aiOn && y >= aiY && !aiOk[t.ai[i]]) continue;
    mask[i] = 1;
  }
  return mask;
}

export function countMask(mask: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) c += mask[i];
  return c;
}

export function years(f: Pick<Filters, 'yearFrom' | 'yearTo'>): number[] {
  const out: number[] = [];
  for (let y = f.yearFrom; y <= f.yearTo; y++) out.push(y);
  return out;
}
