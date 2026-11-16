export type Locale = 'cs' | 'en';
export type L10n = Record<Locale, string>;

export interface Faculty {
  code: string;
  abbr: string;
  name: L10n;
}

export interface MetricMeta {
  key: string;
  label: L10n;
  unit: L10n;
  desc: L10n;
  decimals: number;
  p01: number;
  p99: number;
}

export interface ThesesMeta {
  rows: number;
  yearMin: number;
  yearMax: number;
  aiYear: number;
  columns: { name: string; type: 'u8' | 'f32'; offset: number }[];
  faculties: Faculty[];
  langs: string[];
  aiValues: string[];
  metrics: MetricMeta[];
}

/** Columnar per-thesis table. `year` is an offset from meta.yearMin. */
export interface Theses {
  meta: ThesesMeta;
  n: number;
  fac: Uint8Array;
  year: Uint8Array;
  lang: Uint8Array;
  ai: Uint8Array;
  grade: Uint8Array;
  usable: Uint8Array;
  clean: Uint8Array;
  metrics: Record<string, Float32Array>;
}

export interface WordsMeta {
  lang: string;
  words: string[];
  cells: number;
  preYears: number;
  postYears: number;
  aiValues: number;
  faculties: number;
}

/** Dense word × cell matrix of "number of theses using the word ≥ 2×". */
export interface WordCube {
  meta: WordsMeta;
  langIndex: number;
  counts: Uint16Array;
  index: Map<string, number>;
}

export interface Filters {
  fac: number[];      // selected faculty indices
  yearFrom: number;   // absolute years
  yearTo: number;
  langs: number[];    // selected language indices
  ai: number[];       // selected AI declaration indices (1..4); all four = no filter
}
