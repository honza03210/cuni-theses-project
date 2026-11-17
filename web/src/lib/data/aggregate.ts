import { MIN_CELL_N } from './select';
import type { Theses } from './types';

export interface Point {
  year: number;
  mean: number;
  n: number;
  lo: number;  // 95 % CI
  hi: number;
}

export interface MetricSeries {
  /** faculty index -> yearly points (only cells with n >= MIN_CELL_N) */
  byFac: Map<number, Point[]>;
  /** thesis-weighted mean of the whole selection, per year */
  overall: Point[];
}

function finish(year: number, sum: number, sumSq: number, n: number): Point {
  const mean = sum / n;
  const variance = n > 1 ? Math.max(0, (sumSq - n * mean * mean) / (n - 1)) : 0;
  const half = 1.96 * Math.sqrt(variance / n);
  return { year, mean, n, lo: mean - half, hi: mean + half };
}

/** Yearly means of one style metric per faculty and for the whole selection.
 *  Only rows with a finite metric (= cleanly cut bodies) count. */
export function metricSeries(t: Theses, mask: Uint8Array, metric: string, facs: number[],
                             yearFrom: number, yearTo: number, minN = MIN_CELL_N): MetricSeries {
  const values = t.metrics[metric];
  const ny = yearTo - yearFrom + 1;
  const nf = t.meta.faculties.length;
  const sum = new Float64Array(nf * ny);
  const sq = new Float64Array(nf * ny);
  const cnt = new Uint32Array(nf * ny);
  const y0 = yearFrom - t.meta.yearMin;
  for (let i = 0; i < t.n; i++) {
    if (!mask[i]) continue;
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const y = t.year[i] - y0;
    if (y < 0 || y >= ny) continue;
    const k = t.fac[i] * ny + y;
    sum[k] += v; sq[k] += v * v; cnt[k]++;
  }
  const byFac = new Map<number, Point[]>();
  const oSum = new Float64Array(ny), oSq = new Float64Array(ny), oCnt = new Uint32Array(ny);
  for (const f of facs) {
    const pts: Point[] = [];
    for (let y = 0; y < ny; y++) {
      const k = f * ny + y;
      oSum[y] += sum[k]; oSq[y] += sq[k]; oCnt[y] += cnt[k];
      if (cnt[k] >= minN) pts.push(finish(yearFrom + y, sum[k], sq[k], cnt[k]));
    }
    byFac.set(f, pts);
  }
  const overall: Point[] = [];
  for (let y = 0; y < ny; y++) {
    if (oCnt[y] >= minN) overall.push(finish(yearFrom + y, oSum[y], oSq[y], oCnt[y]));
  }
  return { byFac, overall };
}

/** counts[g-1] for grades 1..4 */
export type GradeCounts = [number, number, number, number];

export interface GradeYear { year: number; counts: GradeCounts; total: number }

export function gradesByYear(t: Theses, mask: Uint8Array, yearFrom: number, yearTo: number): GradeYear[] {
  const ny = yearTo - yearFrom + 1;
  const c = new Uint32Array(ny * 4);
  const y0 = yearFrom - t.meta.yearMin;
  for (let i = 0; i < t.n; i++) {
    if (!mask[i]) continue;
    const g = t.grade[i];
    if (g < 1 || g > 4) continue;
    const y = t.year[i] - y0;
    if (y < 0 || y >= ny) continue;
    c[y * 4 + g - 1]++;
  }
  const out: GradeYear[] = [];
  for (let y = 0; y < ny; y++) {
    const counts: GradeCounts = [c[y * 4], c[y * 4 + 1], c[y * 4 + 2], c[y * 4 + 3]];
    out.push({ year: yearFrom + y, counts, total: counts[0] + counts[1] + counts[2] + counts[3] });
  }
  return out;
}

export interface GradeFac { fac: number; counts: GradeCounts; total: number }

export function gradesByFaculty(t: Theses, mask: Uint8Array, year: number, facs: number[]): GradeFac[] {
  return gradesByFacultyRange(t, mask, year, year, facs);
}

/** Grade counts per faculty, pooled over the years [from, to]. */
export function gradesByFacultyRange(t: Theses, mask: Uint8Array, from: number, to: number, facs: number[]): GradeFac[] {
  const nf = t.meta.faculties.length;
  const c = new Uint32Array(nf * 4);
  const y0 = from - t.meta.yearMin, y1 = to - t.meta.yearMin;
  for (let i = 0; i < t.n; i++) {
    if (!mask[i] || t.year[i] < y0 || t.year[i] > y1) continue;
    const g = t.grade[i];
    if (g < 1 || g > 4) continue;
    c[t.fac[i] * 4 + g - 1]++;
  }
  return facs.map((f) => {
    const counts: GradeCounts = [c[f * 4], c[f * 4 + 1], c[f * 4 + 2], c[f * 4 + 3]];
    return { fac: f, counts, total: counts[0] + counts[1] + counts[2] + counts[3] };
  });
}

export function sumCounts(rows: { counts: GradeCounts }[]): GradeCounts {
  const s: GradeCounts = [0, 0, 0, 0];
  for (const r of rows) for (let g = 0; g < 4; g++) s[g] += r.counts[g];
  return s;
}
