import type { Theses } from '../data/types';
import { defaults, type AppState, type Domain } from './url';

/** The single source of truth for filters and view state. */
export const app: AppState = $state(defaults({ facCodes: [], langs: ['cs'], yearMin: 2006, yearMax: 2026, metrics: [''] }));

/** Transient UI state that is not shared through the URL. */
export const ui = $state({
  hoverFac: null as number | null,
});

export function domainOf(t: Theses): Domain {
  return {
    facCodes: t.meta.faculties.map((f) => f.code),
    langs: t.meta.langs,
    yearMin: t.meta.yearMin,
    yearMax: t.meta.yearMax,
    metrics: t.meta.metrics.filter((m) => m.trend !== false).map((m) => m.key),
  };
}

export function assign(next: AppState) {
  Object.assign(app, next);
}

/** Put every filter back to its default (the panel's "Reset to defaults" and empty-state recovery). */
export function resetFilters(t: Theses) {
  const d = defaults(domainOf(t));
  app.fac = d.fac; app.yearFrom = d.yearFrom; app.yearTo = d.yearTo;
  app.langs = d.langs; app.ai = d.ai; app.genders = d.genders; app.grades = d.grades; app.brushes = {}; app.zoom = null;
}
