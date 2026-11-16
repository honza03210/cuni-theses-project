import type { Locale } from '../data/types';

export type View = 'words' | 'trends' | 'grades';

export interface AppState {
  view: View;
  locale: Locale;
  fac: number[];
  yearFrom: number;
  yearTo: number;
  langs: number[];
  ai: number[];
  metric: string;
  word: string | null;
  wordLang: number | null;
  minFreq: number;          // share, e.g. 0.01
  wordFrom: number;         // word cloud: first target year
  wordTo: number;           // word cloud: last target year
  wordBase: number;         // word cloud: baseline length in years
  lemma: boolean;           // word cloud: merge inflected forms (lemmas)
  gradeYear: number | null;
  brushes: Record<string, [number, number]>;
  table: Record<string, boolean>;
}

export interface Domain {
  facCodes: string[];
  langs: string[];
  yearMin: number;
  yearMax: number;
  metrics: string[];
}

export function defaults(d: Domain): AppState {
  return {
    view: 'words',
    locale: 'en',
    fac: d.facCodes.map((_, i) => i),
    yearFrom: d.yearMin,
    yearTo: d.yearMax - 1,  // current year is incomplete
    langs: [0],
    ai: [1, 2, 3, 4],
    metric: d.metrics[0],
    word: null,
    wordLang: null,
    minFreq: 0.01,
    wordFrom: d.yearMax - 1,  // last complete year
    wordTo: d.yearMax - 1,
    wordBase: 5,
    lemma: true,
    gradeYear: null,
    brushes: {},
    table: {},
  };
}

const VIEWS: View[] = ['words', 'trends', 'grades'];

function sameSet(a: number[], b: number[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export function encode(s: AppState, d: Domain): string {
  const def = defaults(d);
  const p = new URLSearchParams();
  if (s.view !== def.view) p.set('v', s.view);
  if (s.locale !== def.locale) p.set('l', s.locale);
  if (!sameSet(s.fac, def.fac)) p.set('f', s.fac.map((i) => d.facCodes[i]).join(',') || '-');
  if (s.yearFrom !== def.yearFrom || s.yearTo !== def.yearTo) p.set('y', `${s.yearFrom}-${s.yearTo}`);
  if (!sameSet(s.langs, def.langs)) p.set('lg', s.langs.map((i) => d.langs[i]).join(',') || '-');
  if (!sameSet(s.ai, def.ai)) p.set('ai', s.ai.join(',') || '-');
  if (s.metric !== def.metric) p.set('m', s.metric);
  if (s.word) p.set('w', s.word);
  if (s.wordLang !== null) p.set('wl', d.langs[s.wordLang]);
  if (s.minFreq !== def.minFreq) p.set('mf', String(s.minFreq));
  if (s.wordFrom !== def.wordFrom || s.wordTo !== def.wordTo) p.set('wy', s.wordFrom === s.wordTo ? `${s.wordFrom}` : `${s.wordFrom}-${s.wordTo}`);
  if (s.wordBase !== def.wordBase) p.set('wb', String(s.wordBase));
  if (!s.lemma) p.set('wf', '1');
  if (s.gradeYear !== null) p.set('gy', String(s.gradeYear));
  const b = Object.entries(s.brushes)
    .map(([k, [lo, hi]]) => `${k}:${+lo.toPrecision(4)}:${+hi.toPrecision(4)}`);
  if (b.length) p.set('b', b.join(';'));
  const tb = Object.entries(s.table).filter(([, v]) => v).map(([k]) => k);
  if (tb.length) p.set('t', tb.join(','));
  return p.toString();
}

function intIn(v: string | null, lo: number, hi: number): number | null {
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = +v;
  return n >= lo && n <= hi ? n : null;
}

export function decode(query: string, d: Domain): AppState {
  const s = defaults(d);
  const p = new URLSearchParams(query);
  const v = p.get('v');
  if (v && (VIEWS as string[]).includes(v)) s.view = v as View;
  const l = p.get('l');
  if (l === 'cs' || l === 'en') s.locale = l;
  const list = (key: string, names: string[]) => {
    const raw = p.get(key);
    if (raw === null) return null;
    if (raw === '-') return [];
    return raw.split(',').map((x) => names.indexOf(x)).filter((i) => i >= 0);
  };
  s.fac = list('f', d.facCodes) ?? s.fac;
  s.langs = list('lg', d.langs) ?? s.langs;
  const ai = p.get('ai');
  if (ai !== null) s.ai = ai === '-' ? [] : ai.split(',').map((x) => intIn(x, 1, 4)).filter((x): x is number => x !== null);
  const y = p.get('y')?.match(/^(\d{4})-(\d{4})$/);
  if (y) {
    const a = intIn(y[1], d.yearMin, d.yearMax), b = intIn(y[2], d.yearMin, d.yearMax);
    if (a !== null && b !== null && a <= b) { s.yearFrom = a; s.yearTo = b; }
  }
  const m = p.get('m');
  if (m && d.metrics.includes(m)) s.metric = m;
  const w = p.get('w');
  if (w && w.length <= 60) s.word = w;
  const wl = p.get('wl');
  if (wl && d.langs.includes(wl)) s.wordLang = d.langs.indexOf(wl);
  const mf = Number(p.get('mf'));
  if (p.has('mf') && mf >= 0.001 && mf <= 0.2) s.minFreq = mf;
  s.gradeYear = intIn(p.get('gy'), d.yearMin, d.yearMax);
  const wy = p.get('wy')?.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (wy) {
    const a = intIn(wy[1], d.yearMin, d.yearMax), b = intIn(wy[2] ?? wy[1], d.yearMin, d.yearMax);
    if (a !== null && b !== null && a <= b) { s.wordFrom = a; s.wordTo = b; }
  }
  const wb = intIn(p.get('wb'), 3, 8);
  if (wb !== null) s.wordBase = wb;
  if (p.get('wf') === '1') s.lemma = false;
  for (const part of (p.get('b') ?? '').split(';')) {
    const [k, lo, hi] = part.split(':');
    if (k && Number.isFinite(+lo) && Number.isFinite(+hi) && lo !== '' && hi !== '') {
      s.brushes[k] = [Math.min(+lo, +hi), Math.max(+lo, +hi)];
    }
  }
  for (const k of (p.get('t') ?? '').split(',')) if (k) s.table[k] = true;
  return s;
}
