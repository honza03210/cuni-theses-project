<script lang="ts">
  import type { Theses } from '../data/types';
  import { app, domainOf, resetFilters } from '../state/app.svelte';
  import { defaults } from '../state/url';
  import { L } from '../locale.svelte';

  /** Says which filter emptied the selection and offers the one-click way back.
   *  `grades=false` where the grade filter does not apply (Words). */
  interface Props { theses: Theses; grades?: boolean }
  let { theses, grades = true }: Props = $props();

  const cause = $derived(
    !app.fac.length ? 'fac'
    : !app.langs.length ? 'lang'
    : !app.genders.length ? 'gender'
    : grades && !app.grades.length ? 'grade'
    : !app.ai.length ? 'ai'
    : 'other');
  const msg = $derived(L.t[`empty.${cause}` as 'empty.fac']);
  // each cause restores only its own group, so the reader's other choices survive
  const d = $derived(defaults(domainOf(theses)));
  function fix() {
    if (cause === 'fac') app.fac = d.fac;
    else if (cause === 'lang') app.langs = d.langs;
    else if (cause === 'gender') app.genders = d.genders;
    else if (cause === 'grade') app.grades = d.grades;
    else if (cause === 'ai') app.ai = d.ai;
    else resetFilters(theses);
  }
  const action = $derived(
    cause === 'fac' ? L.t['common.selectAll']
    : cause === 'lang' ? L.t['empty.fix.lang'](d.langs.map((i) => L.t[`lang.${theses.meta.langs[i]}` as 'lang.cs'] ?? theses.meta.langs[i]).join(', '))
    : cause === 'gender' || cause === 'grade' ? L.t['empty.fix.all']
    : cause === 'ai' ? L.t['filters.aiAll']
    : L.t['filters.reset']);
</script>

<p class="empty-note" role="status"><b>{msg}</b> <button type="button" class="fix" onclick={fix}>{action}</button></p>

<style>
  .empty-note { margin: 0; font-size: var(--fs-md); line-height: 1.5; text-wrap: pretty; }
  .fix { margin-left: 6px; border: 1px solid var(--ink-3); background: var(--paper); color: var(--ink); border-radius: 3px; padding: 4px 12px; font-size: var(--fs-sm); cursor: pointer; vertical-align: 1px; }
  .fix:hover { border-color: var(--ink); background: var(--paper-2); }
</style>
