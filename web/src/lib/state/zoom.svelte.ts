import { app } from './app.svelte';
import { L } from '../locale.svelte';

/** Shared year zoom for every time-series chart: drag across a chart to zoom all of them to
 *  those years, double-click (or Escape, or the reset button) to zoom out. Visual only: the
 *  filters, answer lines and statistics keep using the selected year range. It lives in the
 *  app state, so a shared link keeps it (`z=` in the URL). */
export const zoom = {
  get range() { return app.zoom; },
  set range(v: [number, number] | null) { app.zoom = v; },
};

export function resetZoom() {
  zoom.range = null;
}

/** Make the zoom the year filter: the lens becomes the selection. */
export function applyZoom() {
  const r = zoom.range;
  if (!r) return;
  app.yearFrom = r[0];
  app.yearTo = r[1];
  zoom.range = null;
}

/** "2006–2025", or the zoomed span marked as such, for chart subtitles. */
export function yearsLabel(from: number, to: number): string {
  const [a, b] = zoomed(from, to);
  return a === from && b === to ? `${from}–${to}` : `${a}–${b} ${L.t['zoom.tag']}`;
}

/** The years a chart covering [from, to] shows under the current zoom. */
export function zoomed(from: number, to: number): [number, number] {
  const r = zoom.range;
  if (!r) return [from, to];
  const a = Math.max(from, r[0]), b = Math.min(to, r[1]);
  return b > a ? [a, b] : [from, to];
}

/** Drag state for one chart. Positions are fractional years; the zoom snaps to whole years. */
export class YearDrag {
  a: number | null = $state(null);
  b: number | null = $state(null);
  /** true right after a drag that zoomed, so the click that follows is ignored */
  zoomedNow = false;

  get active() { return this.a !== null; }
  get lo() { return Math.min(this.a ?? 0, this.b ?? 0); }
  get hi() { return Math.max(this.a ?? 0, this.b ?? 0); }

  /** Start on a mouse or pen press; touch keeps scrolling the page. */
  begin(e: PointerEvent, year: number) {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    // no text selection or focus ring while dragging across the chart
    e.preventDefault();
    this.a = this.b = year;
    this.zoomedNow = false;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  move(year: number) {
    if (this.a !== null) this.b = year;
  }

  /** Commit: zoom when the drag spans at least one whole year. */
  end() {
    if (this.a === null || this.b === null) return;
    const lo = Math.round(Math.min(this.a, this.b)), hi = Math.round(Math.max(this.a, this.b));
    this.a = this.b = null;
    if (hi - lo >= 1) {
      zoom.range = [lo, hi];
      this.zoomedNow = true;
    }
  }

  cancel() {
    this.a = this.b = null;
  }
}
