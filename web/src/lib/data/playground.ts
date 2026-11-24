import { MIN_CELL_N } from './select';
import type { Theses } from './types';

/** Extra per-thesis columns for the playground page, in theses.bin row order. */
export interface PlaygroundCols {
  /** em dashes in the body; MISSING = no clean body */
  emDash: Uint16Array;
}
export const MISSING = 65535;

export async function loadPlayground(base: string): Promise<PlaygroundCols> {
  const res = await fetch(`${base}playground.bin.gz`);
  if (!res.ok) throw new Error(`playground.bin.gz: HTTP ${res.status}`);
  let buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] === 0x1f && head[1] === 0x8b) {
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  return { emDash: new Uint16Array(buf) };
}

export interface SharePoint { year: number; k: number; n: number; share: number; lo: number; hi: number }

/** Wilson 95 % interval for k successes out of n. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n, z2 = z * z;
  const c = (p + z2 / (2 * n)) / (1 + z2 / n);
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** Per year: share of clean theses in `lang` (and `fac`, or all faculties when null)
 *  with at least `atLeast` values in `counts`. Years with n < MIN_CELL_N are left out. */
export function shareAtLeast(t: Theses, counts: Uint16Array, atLeast: number, lang: number, fac: number | null): SharePoint[] {
  const years = t.meta.yearMax - t.meta.yearMin + 1;
  const nn = new Uint32Array(years), kk = new Uint32Array(years);
  for (let i = 0; i < t.n; i++) {
    const c = counts[i];
    if (c === MISSING || t.lang[i] !== lang || (fac !== null && t.fac[i] !== fac)) continue;
    nn[t.year[i]]++;
    if (c >= atLeast) kk[t.year[i]]++;
  }
  const out: SharePoint[] = [];
  for (let y = 0; y < years; y++) {
    if (nn[y] < MIN_CELL_N) continue;
    const [lo, hi] = wilson(kk[y], nn[y]);
    out.push({ year: t.meta.yearMin + y, k: kk[y], n: nn[y], share: kk[y] / nn[y], lo, hi });
  }
  return out;
}
