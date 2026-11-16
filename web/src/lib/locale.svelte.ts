import { app } from './state/app.svelte';
import { dicts, fmt } from './i18n';
import type { L10n } from './data/types';

const formatters = { cs: fmt('cs'), en: fmt('en') };

/** Reactive access to the active dictionary and number formatters. */
export const L = {
  get t() { return dicts[app.locale]; },
  get f() { return formatters[app.locale]; },
  get locale() { return app.locale; },
  pick(v: L10n) { return v[app.locale]; },
};
