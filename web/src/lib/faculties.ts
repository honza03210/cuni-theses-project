import type { L10n } from './data/types';

/** Short faculty names for the simple version, where the public cannot be expected to know
 *  the abbreviations (PřF, HTF, LF HK). Keyed by faculty code from theses.json. */
export const FAC_SHORT: Record<string, L10n> = {
  ff: { cs: 'Filozofická', en: 'Arts' },
  fhs: { cs: 'Humanitní studia', en: 'Humanities' },
  fsv: { cs: 'Sociální vědy', en: 'Social Sciences' },
  pedf: { cs: 'Pedagogická', en: 'Education' },
  ftvs: { cs: 'Tělesná výchova', en: 'Sport' },
  etf: { cs: 'Evangelická teologie', en: 'Protestant Theology' },
  htf: { cs: 'Husitská teologie', en: 'Hussite Theology' },
  ktf: { cs: 'Katolická teologie', en: 'Catholic Theology' },
  mff: { cs: 'Matematika a fyzika', en: 'Maths & Physics' },
  prf: { cs: 'Přírodověda', en: 'Science' },
  lf1: { cs: '1. lékařská', en: '1st Medicine' },
  lf2: { cs: '2. lékařská', en: '2nd Medicine' },
  lf3: { cs: '3. lékařská', en: '3rd Medicine' },
  lfhk: { cs: 'Lékařská HK', en: 'Medicine Hradec' },
  faf: { cs: 'Farmaceutická', en: 'Pharmacy' },
};
