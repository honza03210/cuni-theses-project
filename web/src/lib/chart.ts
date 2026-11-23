import { line, area, type ScaleLinear } from 'd3';
import type { Point } from './data/aggregate';

/** Mid-November 2022 on a year axis where each year is centred on its integer. */
export const CHATGPT_X = 2022.87;

/** Split a series into solid (complete years) and dotted (incomplete last year) paths. */
export function seriesPaths(pts: { year: number; v: number }[], x: ScaleLinear<number, number>,
                            y: ScaleLinear<number, number>, incompleteYear: number) {
  const gen = line<{ year: number; v: number }>().x((d) => x(d.year)).y((d) => y(d.v));
  // break the line where years are missing
  const runs: { year: number; v: number }[][] = [];
  let cur: { year: number; v: number }[] = [];
  for (const p of pts) {
    if (cur.length && p.year - cur[cur.length - 1].year > 1) { runs.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) runs.push(cur);
  let solid = '', dotted = '';
  for (const r of runs) {
    const last = r[r.length - 1];
    if (last.year === incompleteYear && r.length >= 2) {
      solid += gen(r.slice(0, -1)) ?? '';
      dotted += gen(r.slice(-2)) ?? '';
    } else if (r.length >= 2) {
      solid += gen(r) ?? '';
    }
  }
  return { solid, dotted, singles: runs.filter((r) => r.length === 1).map((r) => r[0]) };
}

export function bandPath(pts: Point[], x: ScaleLinear<number, number>, y: ScaleLinear<number, number>) {
  return area<Point>().x((d) => x(d.year)).y0((d) => y(d.lo)).y1((d) => y(d.hi))(pts) ?? '';
}

export function padDomain(lo: number, hi: number, frac = 0.06): [number, number] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) return [lo - 1, hi + 1];
  const p = (hi - lo) * frac;
  return [lo - p, hi + p];
}

/** Tick years: every year if few, otherwise a stride that keeps labels apart. */
export function yearTicks(from: number, to: number, width: number, minGap = 38): number[] {
  const span = to - from;
  const fit = Math.max(1, Math.floor(width / minGap));
  const stride = [1, 2, 4, 5, 10].find((s) => span / s <= fit) ?? 10;
  const out: number[] = [];
  const start = Math.ceil(from / stride) * stride;
  for (let y = start; y <= to; y += stride) out.push(y);
  return out;
}

export const GRADE_VARS = ['var(--grade-1)', 'var(--grade-2)', 'var(--grade-3)', 'var(--grade-4)'];
/** The grade colours as resolved for the current theme (canvas cannot read CSS variables). */
export function gradeHex(): string[] {
  const cs = getComputedStyle(document.documentElement);
  return [1, 2, 3, 4].map((g) => cs.getPropertyValue(`--grade-${g}`).trim());
}
/** Non-colour grade channels, shared by every Grades chart and its one legend */
export const GRADE_DASH = ['', '9 3', '5 3', '2 3'];
export const GRADE_SHAPES = [
  (r: number) => `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`,
  (r: number) => `M${-r * 0.88},${-r * 0.88}h${r * 1.76}v${r * 1.76}h${-r * 1.76}z`,
  (r: number) => `M0,${-r * 1.2}L${r * 1.2},0L0,${r * 1.2}L${-r * 1.2},0z`,
  (r: number) => `M0,${-r * 1.15}L${r * 1.15},${r * 0.85}L${-r * 1.15},${r * 0.85}z`,
];
