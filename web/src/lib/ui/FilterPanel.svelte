<script lang="ts">
  import type { Theses } from '../data/types';
  import { aiFilterActive, filterMask } from '../data/select';
  import { app } from '../state/app.svelte';
  import { defaults } from '../state/url';
  import { domainOf } from '../state/app.svelte';
  import { L } from '../locale.svelte';
  import YearRange from './YearRange.svelte';

  interface Props { theses: Theses; matched: number; aiApplies: boolean; yearsLocked?: boolean }
  let { theses, matched, aiApplies, yearsLocked = false }: Props = $props();

  const meta = $derived(theses.meta);

  // Per-option counts given all *other* filters (so a count shows what ticking it would add)
  const counts = $derived.by(() => {
    const base = { fac: app.fac, yearFrom: app.yearFrom, yearTo: app.yearTo, langs: app.langs, ai: app.ai };
    const fac = new Array(meta.faculties.length).fill(0);
    const lang = new Array(meta.langs.length).fill(0);
    const ai = new Array(5).fill(0);
    const mFac = filterMask(theses, { ...base, fac: meta.faculties.map((_, i) => i) });
    const mLang = filterMask(theses, { ...base, langs: meta.langs.map((_, i) => i) });
    const mAi = filterMask(theses, { ...base, ai: [1, 2, 3, 4] });
    for (let i = 0; i < theses.n; i++) {
      if (mFac[i]) fac[theses.fac[i]]++;
      if (mLang[i]) lang[theses.lang[i]]++;
      if (mAi[i] && theses.year[i] + meta.yearMin >= meta.aiYear) ai[theses.ai[i]]++;
    }
    return { fac, lang, ai };
  });

  // With the AI filter on, the count mixes two groups: declared theses from 2023 on + all earlier ones.
  const split = $derived.by(() => {
    if (!aiFilterActive(app.ai) || !aiApplies) return null;
    const m = filterMask(theses, { fac: app.fac, yearFrom: app.yearFrom, yearTo: app.yearTo, langs: app.langs, ai: app.ai });
    const aiY = meta.aiYear - meta.yearMin;
    let post = 0, pre = 0;
    for (let i = 0; i < theses.n; i++) if (m[i]) { if (theses.year[i] >= aiY) post++; else pre++; }
    return { post, pre };
  });

  const aiMode = $derived(app.ai.length === 4 ? 'all' : app.ai.length === 1 && app.ai[0] === 1 ? 'declared' : 'custom');

  function toggle(list: number[], v: number): number[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort((a, b) => a - b);
  }

  function reset() {
    const d = defaults(domainOf(theses));
    app.fac = d.fac; app.yearFrom = d.yearFrom; app.yearTo = d.yearTo;
    app.langs = d.langs; app.ai = d.ai; app.brushes = {};
  }
</script>

<div class="panel">
  <div class="count" aria-live="polite">
    <strong>{L.f.int(matched)}</strong>
    <span>{yearsLocked ? L.t['filters.matchYears'](app.yearFrom, app.yearTo) : L.t['filters.match']}</span>
  </div>
  {#if split}<p class="note counts-note ai-count">{L.t['filters.countSplit'](L.f.int(split.post), L.f.int(split.pre))}</p>{/if}
  <p class="note counts-note">{L.t['filters.countsNote']}</p>


  <fieldset>
    <legend>
      <span>{L.t['filters.faculty']}</span>
      <span class="quick">
        <button type="button" onclick={() => (app.fac = meta.faculties.map((_, i) => i))}>{L.t['filters.all']}</button>
        <button type="button" onclick={() => (app.fac = [])}>{L.t['filters.none']}</button>
      </span>
    </legend>
    <ul class="checks">
      {#each meta.faculties as fac, i (fac.code)}
        <li>
          <label title={L.pick(fac.name)}>
            <input type="checkbox" checked={app.fac.includes(i)} onchange={() => (app.fac = toggle(app.fac, i))} />
            <span class="abbr">{fac.abbr}</span>
            <span class="name">{L.pick(fac.name)}</span>
            <span class="n">{L.f.int(counts.fac[i])}</span>
          </label>
        </li>
      {/each}
    </ul>
    {#if !app.fac.length}<p class="warn" role="status">{L.t['filters.noFaculty']}</p>{/if}
  </fieldset>

  {#if !yearsLocked}
    <fieldset>
      <legend><span>{L.t['filters.years']}</span></legend>
      <YearRange min={meta.yearMin} max={meta.yearMax} from={app.yearFrom} to={app.yearTo}
        onchange={(a, b) => { app.yearFrom = a; app.yearTo = b; }} />
      {#if app.yearTo === meta.yearMax}<p class="note">{L.t['filters.incomplete']}</p>{/if}
    </fieldset>
  {:else}
    <p class="note years-moved">{L.t['filters.yearsOnTimeline']}</p>
  {/if}

  <fieldset>
    <legend><span>{L.t['filters.language']}</span></legend>
    <ul class="checks">
      {#each meta.langs as lang, i (lang)}
        <li>
          <label>
            <input type="checkbox" checked={app.langs.includes(i)} onchange={() => (app.langs = toggle(app.langs, i))} />
            <span class="name">{L.t[`lang.${lang}` as 'lang.cs']}</span>
            <span class="n">{L.f.int(counts.lang[i])}</span>
          </label>
        </li>
      {/each}
    </ul>
    {#if !app.langs.length}<p class="warn" role="status">{L.t['filters.noLang']}</p>{/if}
  </fieldset>

  <fieldset disabled={!aiApplies}>
    <legend><span>{L.t['filters.ai']}</span></legend>
    <!-- the common choice up front; the four declaration categories fold behind it -->
    <ul class="checks">
      <li>
        <label>
          <input type="radio" name="ai-mode" checked={aiMode === 'all'} onchange={() => (app.ai = [1, 2, 3, 4])} />
          <span class="name">{L.t['filters.aiAll']}</span>
        </label>
      </li>
      <li>
        <label>
          <input type="radio" name="ai-mode" checked={aiMode === 'declared'} onchange={() => (app.ai = [1])} />
          <span class="name">{L.t['filters.aiDeclared']}</span>
          <span class="n">{L.f.int(counts.ai[1])}</span>
        </label>
      </li>
    </ul>
    <details class="defs" open={aiMode === 'custom'}>
      <summary>{L.t['filters.aiCats']}</summary>
      <ul class="checks sub">
        {#each [1, 2, 3, 4] as a (a)}
          <li>
            <label>
              <input type="checkbox" checked={app.ai.includes(a)} onchange={() => (app.ai = toggle(app.ai, a))} />
              <span class="name">{L.t[`ai.${a}` as 'ai.1']}</span>
              <span class="n">{L.f.int(counts.ai[a])}</span>
            </label>
          </li>
        {/each}
      </ul>
      <dl>
        {#each [1, 2, 3, 4] as a (a)}<dt>{L.t[`ai.${a}` as 'ai.1']}</dt><dd>{L.t[`ai.def.${a}` as 'ai.def.1']}</dd>{/each}
      </dl>
    </details>
    <p class="note">{L.t['filters.aiNote']}</p>
    {#if !app.ai.length}<p class="warn" role="status">{L.t['filters.noAi']}</p>{/if}
  </fieldset>

  <button type="button" class="reset" onclick={reset}>{L.t['filters.reset']}</button>
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: var(--s5); padding: var(--s4) var(--s4) var(--s6); }
  .count {
    display: flex; align-items: baseline; gap: 6px;
    padding-bottom: var(--s3);
    border-bottom: 1px solid var(--ink);
  }
  .count strong { font-size: var(--fs-2xl); font-weight: 700; letter-spacing: -0.01em; }
  .count span { font-size: var(--fs-sm); color: var(--ink-2); }

  fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
  fieldset:disabled { opacity: 0.55; }
  legend {
    display: flex; justify-content: space-between; align-items: baseline;
    width: 100%;
    padding: 0 0 6px;
    font-size: var(--fs-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-2);
  }
  .quick { display: inline-flex; gap: 2px; text-transform: none; letter-spacing: 0; }
  .quick button {
    border: 0; background: none; cursor: pointer;
    font-size: var(--fs-xs); font-weight: 600; color: var(--ink);
    padding: 2px 6px; border-radius: 2px;
    text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 3px;
  }
  .quick button:hover { background: var(--paper-3); text-decoration-color: var(--ink); }

  .checks { list-style: none; margin: 0; padding: 0; }
  label {
    display: grid;
    grid-template-columns: 18px auto 1fr auto;
    align-items: center;
    column-gap: 6px;
    padding: 3px 4px;
    margin: 0 -4px;
    border-radius: 2px;
    font-size: var(--fs-sm);
    cursor: pointer;
  }
  label:hover { background: var(--paper-3); }
  .checks label:not(:has(.abbr)) { grid-template-columns: 18px 1fr auto; }
  /* ink, not petrol: ticked-by-default boxes are not a choice the reader made */
  input[type='checkbox'], input[type='radio'] { margin: 0; width: 15px; height: 15px; cursor: pointer; accent-color: var(--ink-2); }
  .checks.sub { margin-top: 6px; }
  .abbr { font-weight: 600; min-width: 3.4em; }
  .name { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .checks label:not(:has(.abbr)) .name { color: var(--ink); }
  .n { color: var(--ink-3); font-size: var(--fs-xs); }
  .note { margin: 6px 0 0; font-size: var(--fs-xs); color: var(--ink-3); line-height: 1.45; text-wrap: pretty; }
  /* a count, not a warning: the one ochre caveat lives in the answer line */
  .ai-count { color: var(--ink-2); }
  .ai-count + .counts-note { margin-top: 0; }
  .counts-note { margin: calc(-1 * var(--s4)) 0 0; }
  .defs { margin-top: 6px; font-size: var(--fs-xs); color: var(--ink-2); }
  .defs summary { cursor: pointer; font-weight: 600; text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 3px; }
  .defs dl { margin: 6px 0 0; }
  .defs dt { font-weight: 600; color: var(--ink); margin-top: 6px; }
  .defs dd { margin: 1px 0 0; line-height: 1.45; }
  @media (max-width: 1023px) {
    label { padding: 8px 4px; min-height: 40px; }
    input[type='checkbox'], input[type='radio'] { width: 18px; height: 18px; }
    label { grid-template-columns: 22px auto 1fr auto; }
    .checks label:not(:has(.abbr)) { grid-template-columns: 22px 1fr auto; }
    .quick button { padding: 8px 10px; }
    .reset { padding: 10px 16px; }
  }
  .warn { margin: 6px 0 0; font-size: var(--fs-xs); color: var(--warn); font-weight: 600; }
  .reset {
    align-self: flex-start;
    border: 1px solid var(--rule);
    background: var(--paper);
    border-radius: 3px;
    padding: 5px 12px;
    font-size: var(--fs-sm);
    cursor: pointer;
    transition: border-color var(--t) var(--ease);
  }
  .reset:hover { border-color: var(--ink-3); }
</style>
