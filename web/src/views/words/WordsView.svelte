<script lang="ts">
  import { LEMMA_LANGS, loadGlosses, loadWordCube } from '../../lib/data/load';
  import { buildWordContext, clampComparison, rampFor, rankValue, scoreWords, topMovers, BASE_MAX, BASE_MIN, type Comparison } from '../../lib/data/excess';
  import { aiFilterActive } from '../../lib/data/select';
  import type { Filters, Theses, WordCube } from '../../lib/data/types';
  import { app } from '../../lib/state/app.svelte';
  import { L } from '../../lib/locale.svelte';
  import Plate from '../../lib/ui/Plate.svelte';
  import WordCloud from './WordCloud.svelte';
  import WordDetail from './WordDetail.svelte';
  import WordTimeline from './WordTimeline.svelte';
  import Lede from '../../lib/ui/Lede.svelte';
  import { tick } from 'svelte';
  import { dataSpan } from '../../lib/data/answers';
  import { aiWho } from '../../lib/ui/AiCaveat.svelte';

  interface Props { theses: Theses; filters: Filters }
  let { theses, filters }: Props = $props();

  const meta = $derived(theses.meta);
  const MIN_FREQ_STEPS = [0.002, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1];
  const SMALL_TARGET = 100;
  // phones: cloud first, year controls folded below it
  let narrow = $state(typeof matchMedia === 'function' && matchMedia('(max-width: 639px)').matches);
  $effect(() => {
    const mq = matchMedia('(max-width: 639px)');
    const on = () => (narrow = mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });
  const N_EACH = 25;

  const wordLang = $derived(app.wordLang !== null && app.langs.includes(app.wordLang) ? app.wordLang : app.langs[0] ?? null);

  const lemmaAvailable = $derived(wordLang !== null && LEMMA_LANGS.includes(meta.langs[wordLang]));
  const useLemma = $derived(app.lemma && lemmaAvailable);
  let cube = $state.raw<WordCube | null>(null);
  /** forms behind a lemma (lemma cubes only) */
  function formsOf(word: string): string[] {
    const i = cube?.index.get(word);
    return i !== undefined && cube?.meta.forms ? cube.meta.forms[i].filter((f) => f !== word) : [];
  }
  /** Switch lemmas/forms and keep the selected word: lemma -> its main form, form -> its lemma */
  function setLemma(v: boolean) {
    if (v === app.lemma) return;
    const w = app.word;
    if (w && cube) {
      if (cube.meta.forms) {
        const i = cube.index.get(w);
        app.word = i !== undefined ? (cube.meta.forms[i][0] ?? w) : w;
      } else {
        // the lemma cube is not loaded yet; look the form up once it is
        pendingForm = w;
      }
    }
    app.lemma = v;
  }
  let pendingForm: string | null = null;
  $effect(() => {
    if (!cube?.meta.forms || !pendingForm) return;
    const f = pendingForm;
    pendingForm = null;
    const i = cube.meta.forms.findIndex((fs) => fs.includes(f));
    if (i >= 0) app.word = cube.meta.words[i];
  });
  let cubeError: string | null = $state(null);
  $effect(() => {
    const li = wordLang;
    if (li === null) { cube = null; return; }
    let alive = true;
    cubeError = null;
    const lemma = useLemma;
    if (cube?.langIndex !== li || cube?.lemma !== lemma) cube = null;
    loadWordCube(meta.langs[li], li, lemma)
      .then((c) => { if (alive) cube = c; })
      .catch((e) => { if (alive) cubeError = String(e?.message ?? e); });
    return () => { alive = false; };
  });

  const aiOn = $derived(aiFilterActive(filters.ai));
  const ctx = $derived(cube && filters.fac.length ? buildWordContext(theses, cube, filters, aiOn) : null);
  // What is compared: target years [from, to] against the trend of `base` years before them.
  // Set by the timeline strip / sentence controls; independent of the panel's year range.
  const cmp = $derived(clampComparison({ from: app.wordFrom, to: app.wordTo, base: app.wordBase }, meta.yearMin, meta.yearMax));
  function setCmp(c: Comparison) {
    const k = clampComparison(c, meta.yearMin, meta.yearMax);
    app.wordFrom = k.from; app.wordTo = k.to; app.wordBase = k.base;
  }
  const result = $derived(cube && ctx ? scoreWords(cube, ctx, cmp, app.minFreq) : null);
  const movers = $derived(result ? topMovers(result.scores, N_EACH, app.wordRank) : null);
  const blockLabel = $derived(cmp.from === cmp.to ? `${cmp.from}` : `${cmp.from}–${cmp.to}`);
  const baselineLabel = $derived(`${cmp.from - cmp.base}–${cmp.from - 1}`);
  const totals = $derived(ctx ? ctx.total : new Array(meta.yearMax - meta.yearMin + 1).fill(0));
  // With the AI-declaration filter on, the compared years hold a different group of students:
  // say so, and name only the years that actually have such theses.
  const aiGroup = $derived(aiOn && cmp.to >= meta.aiYear);
  const aiSpan = $derived(aiGroup ? (dataSpan((y) => totals[y - meta.yearMin] ?? 0, Math.max(cmp.from, meta.aiYear), cmp.to) ?? blockLabel) : blockLabel);
  const fromYears = $derived(Array.from({ length: meta.yearMax - (meta.yearMin + BASE_MIN) + 1 }, (_, i) => meta.yearMin + BASE_MIN + i));
  const toYears = $derived(fromYears.filter((y) => y >= cmp.from));
  const baseOptions = $derived(Array.from({ length: BASE_MAX - BASE_MIN + 1 }, (_, i) => BASE_MIN + i).filter((b) => cmp.from - b >= meta.yearMin));

  // step / play through the years, keeping the block length
  const len = $derived(cmp.to - cmp.from);
  const canBack = $derived(cmp.from - 1 - cmp.base >= meta.yearMin || cmp.base > BASE_MIN);
  const canFwd = $derived(cmp.to < meta.yearMax);
  function stepBy(d: number) { setCmp({ ...cmp, from: cmp.from + d, to: cmp.to + d }); }

  const mfIndex = $derived(Math.max(0, MIN_FREQ_STEPS.findIndex((v) => v >= app.minFreq - 1e-9)));

  const chosen = $derived(app.word && cube && cube.index.has(app.word) ? app.word : null);
  // Until the reader picks (or clears) a word, show the top rising word so the detail chart
  // opens filled. It is not written to app.word, so the URL stays clean.
  let cleared = $state(false);
  const autoWord = $derived(!app.word && !cleared && movers?.rising.length && !(result?.reason) ? movers.rising[0].word : null);
  const selected = $derived(chosen ?? autoWord);
  let detailEl: HTMLDivElement | undefined = $state();
  /** Select a word; bring its chart into view when it is below the fold. */
  async function pick(w: string, toggle = true) {
    const off = toggle && selected === w;
    app.word = off ? null : w;
    cleared = off;
    if (!app.word || !detailEl) return;
    await tick();
    const r = detailEl.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.55) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      detailEl.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }
  const times = (score: number) => L.f.num(2 ** score, 2 ** Math.abs(score) >= 10 ? 0 : 1);

  // word search: base forms and (for lemma cubes) their inflected forms
  let q = $state('');
  const formIndex = $derived.by(() => {
    const m = new Map<string, string>();
    if (cube?.meta.forms) cube.meta.forms.forEach((fs, i) => fs.forEach((f) => { if (!m.has(f)) m.set(f, cube!.meta.words[i]); }));
    return m;
  });
  const matches = $derived.by(() => {
    const s = q.trim().toLowerCase();
    if (!cube || s.length < 2) return [] as { word: string; via?: string }[];
    const out: { word: string; via?: string }[] = [];
    const seen = new Set<string>();
    for (const w of cube.meta.words) if (w.startsWith(s) && out.length < 8) { out.push({ word: w }); seen.add(w); }
    for (const [f, w] of formIndex) if (out.length < 8 && f.startsWith(s) && !seen.has(w)) { out.push({ word: w, via: f }); seen.add(w); }
    return out;
  });
  let act = $state(0);
  $effect(() => { void q; act = 0; });
  function choose(w: string) { q = ''; pick(w, false); }
  function searchKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); act = (act + 1) % matches.length; }
    else if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); act = (act - 1 + matches.length) % matches.length; }
    else if (e.key === 'Enter' && matches.length) { e.preventDefault(); choose(matches[act].word); }
    else if (e.key === 'Escape') q = '';
  }

  // English glosses for Czech words (English UI only)
  let glossMap = $state.raw<Record<string, string> | null>(null);
  const wantGloss = $derived(app.locale === 'en' && wordLang !== null && meta.langs[wordLang] === 'cs');
  $effect(() => { if (wantGloss && !glossMap) loadGlosses().then((g) => (glossMap = g)).catch(() => {}); });
  const gloss = (w: string) => (wantGloss ? glossMap?.[w] : undefined);
  const optSummary = $derived([
    app.wordRank === 'gap' ? L.t['words.rank.gap'] : L.t['words.rank.ratio'],
    lemmaAvailable ? (app.lemma ? L.t['words.lemma.on'] : L.t['words.lemma.off']) : null,
    `≥ ${L.f.pct(app.minFreq, app.minFreq < 0.01 ? 1 : 0)}`,
  ].filter(Boolean).join(' · '));

  const listRows = $derived(movers ? [...movers.rising, ...movers.falling] : []);
  const ramp = $derived(rampFor(listRows.map((r) => rankValue(r, app.wordRank))));
  const pp = (gap: number) => L.t['words.pp'](L.f.signed(gap * 100, 1));
  /** the number shown next to a word: the active measure first */
  const figure = (s: { gap: number; score: number }) => app.wordRank === 'gap' ? pp(s.gap) : L.t['words.ratio'](times(s.score));
  const SIZES = [13, 16, 21, 28, 38];
  // Words often linked to AI-assisted academic writing (base forms; cs, sk and en).
  const AI_VOCAB = new Set(['klíčový', 'komplexní', 'zdůrazňovat', 'zásadní', 'podtrhovat', 'umožňovat', 'přispívat', 'přispět',
    'efektivní', 'nezbytný', 'významný', 'výrazně', 'inovativní', 'flexibilní', 'transparentní', 'multidisciplinární', 'posilovat',
    'odrážet', 'zahrnovat', 'poskytovat', 'kľúčový', 'komplexný', 'zdôrazňovať', 'zásadný',
    'key', 'crucial', 'comprehensive', 'delve', 'enhance', 'emphasise', 'emphasize', 'highlight', 'robust', 'foster', 'pivotal',
    'nuanced', 'notably', 'underscore', 'leverage', 'multifaceted', 'innovative', 'facilitate', 'significant']);
  const aiLike = $derived(movers ? movers.rising.slice(0, 12).map((s) => s.word).filter((w) => AI_VOCAB.has(w)).slice(0, 3) : []);
  // topic words of the pandemic years: their 'drop' is the pandemic peak inside the trend, not a change in writing
  const TOPICAL = new Set(['covid', 'pandemie', 'epidemie', 'koronavirus', 'očkování', 'distanční', 'lockdown', 'karanténa', 'pandémia', 'pandemic', 'coronavirus', 'vaccination', 'quarantine']);
  const topical = $derived(movers ? movers.falling.slice(0, 2).map((s) => s.word).filter((w) => TOPICAL.has(w)) : []);
  const smallSample = $derived(!!result && !result.reason && result.targetTotal < SMALL_TARGET);
</script>

{#snippet yearControls()}
  <WordTimeline yearMin={meta.yearMin} yearMax={meta.yearMax} {totals} {cmp} onchange={setCmp} />
  <div class="compare">
    <div class="player" role="group" aria-label={L.t['words.s.player']}>
      <button type="button" disabled={!canBack} onclick={() => { stepBy(-1); }} title={L.t['words.s.prev']} aria-label={L.t['words.s.prev']}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>

      <button type="button" disabled={!canFwd} onclick={() => { stepBy(1); }} title={L.t['words.s.next']} aria-label={L.t['words.s.next']}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <details class="more">
      <summary>{L.t['words.s.precise']}</summary>
      <div class="sentence">
      <span>{L.t['words.s.compare']}</span>
      <select aria-label={L.t['words.s.from']} value={cmp.from} onchange={(e) => { setCmp({ ...cmp, from: +e.currentTarget.value, to: Math.max(+e.currentTarget.value, cmp.to) }); }}>
        {#each fromYears as y (y)}<option value={y}>{y}</option>{/each}
      </select>
      <span>–</span>
      <select aria-label={L.t['words.s.to']} value={cmp.to} onchange={(e) => { setCmp({ ...cmp, to: +e.currentTarget.value }); }}>
        {#each toYears as y (y)}<option value={y}>{y === cmp.from ? `${y} (${L.t['words.s.single']})` : y}{y === meta.yearMax ? ` (${L.t['words.incomplete']})` : ''}</option>{/each}
      </select>
      <span>{L.t['words.s.with']}</span>
      <select aria-label={L.t['words.s.base']} value={cmp.base} onchange={(e) => { setCmp({ ...cmp, base: +e.currentTarget.value }); }}>
        {#each baseOptions as b (b)}<option value={b}>{b}</option>{/each}
      </select>
      <span>{L.t['words.s.years'](baselineLabel)}</span>
    </div>
    </details>
    <details class="more">
      <summary>{L.t['words.opts']}: <span class="opt-sum">{optSummary}</span></summary>
      <div class="opts">
      <div class="seg" role="group" aria-label={L.t['words.rank.label']}>
      <button type="button" aria-pressed={app.wordRank === 'gap'} onclick={() => (app.wordRank = 'gap')} title={L.t['words.rank.gapHint']}>{L.t['words.rank.gap']}</button>
      <button type="button" aria-pressed={app.wordRank === 'ratio'} onclick={() => (app.wordRank = 'ratio')} title={L.t['words.rank.ratioHint']}>{L.t['words.rank.ratio']}</button>
    </div>
    {#if lemmaAvailable}
      <div class="seg" role="group" aria-label={L.t['words.lemma.label']}>
        <button type="button" aria-pressed={app.lemma} onclick={() => setLemma(true)} title={L.t['words.lemma.onHint']}>{L.t['words.lemma.on']}</button>
        <button type="button" aria-pressed={!app.lemma} onclick={() => setLemma(false)} title={L.t['words.lemma.offHint']}>{L.t['words.lemma.off']}</button>
      </div>
    {/if}
    <label class="mf">
      <span>{L.t['words.minFreq']}</span>
      <input type="range" min="0" max={MIN_FREQ_STEPS.length - 1} step="1" value={mfIndex}
        aria-valuetext={L.f.pct(MIN_FREQ_STEPS[mfIndex])}
        oninput={(e) => (app.minFreq = MIN_FREQ_STEPS[+e.currentTarget.value])} />
      <output>{L.f.pct(app.minFreq, app.minFreq < 0.01 ? 1 : 0)}</output>
    </label>
      </div>
    </details>
  </div>
  {/snippet}

<div class="words">
  <Lede howto={L.t['words.howto']}>
    {#if movers && result && !result.reason && movers.rising.length}
      {#if aiGroup}<span class="lead-note">{L.t['ai.lede.note']}</span>{/if}
      {#if smallSample}<span class="hedge">{L.t['words.lede.small'](result.targetTotal)}</span>{' '}{/if}
      <!-- one sentence: three words, with English glosses; figures live in the cloud, tooltip and table -->
      <b>{aiGroup ? L.t['ai.lede.words'](aiWho(), aiSpan, baselineLabel) : L.t['words.lede.up'](blockLabel, baselineLabel)}</b>
      {#each movers.rising.slice(0, 3) as s, i (s.word)}{i ? (i === 2 ? L.t['words.and'] : ', ') : ' '}<button type="button" class="lw" onclick={() => pick(s.word, false)}>{s.word}</button>{#if gloss(s.word)}{' '}<span class="muted">‘{gloss(s.word)}’</span>{/if}{/each}.
      <!-- everything else in one quiet line -->
      <span class="frame">
        {#if movers.falling.length}{L.t['words.lede.drops'](movers.falling.slice(0, 2).map((s) => s.word).join(', '))}{' '}{/if}
        {#if topical.length}{L.t['words.lede.topicalShort']}{' '}{/if}
        {#if !aiGroup && cmp.to >= 2023 && aiLike.length}{L.t['words.lede.aiShort'](aiLike.join(', '))}{/if}
      </span>
    {:else}
      <span class="muted">{L.t['words.cloud.title']}.</span>
    {/if}
  </Lede>
  <Plate id="w-cloud" leadLast={narrow} title={L.t['words.cloud.title']} unit={L.t['words.cloud.unit'](blockLabel, baselineLabel)} foot={app.wordRank === 'gap' ? L.t['words.cloud.footGap'] : L.t['words.cloud.foot']} footTable={L.t['words.table.foot']}>
    {#snippet tools()}
      {#if app.langs.length > 1}
        <div class="seg" role="group" aria-label={L.t['words.lang']}>
          {#each app.langs as li (li)}
            <button type="button" aria-pressed={li === wordLang} onclick={() => (app.wordLang = li)}>{meta.langs[li]}</button>
          {/each}
        </div>
      {/if}
    {/snippet}
    {#snippet table()}
      <table>
        <thead><tr><th>{L.t['words.col.word']}</th>{#if wantGloss && glossMap}<th class="forms-h">{L.t['words.col.gloss']}</th>{/if}{#if useLemma}<th class="forms-h">{L.t['words.col.forms']}</th>{/if}<th>{L.t['words.col.obs']}</th><th>{L.t['words.col.exp']}</th><th>{L.t['words.col.gap']}</th><th>{L.t['words.col.times']}</th><th>{L.t['words.col.docs']}</th></tr></thead>
        <tbody>
          {#each listRows as s (s.word)}
            <tr>
              <td><button type="button" class="wbtn" class:rise={s.score > 0} class:fall={s.score < 0} aria-pressed={selected === s.word} onclick={() => pick(s.word)}>{s.word}</button></td>
              {#if wantGloss && glossMap}<td class="forms">{gloss(s.word) ?? ''}</td>{/if}
              {#if useLemma}<td class="muted forms">{formsOf(s.word).join(', ')}</td>{/if}
              <td>{L.f.pct(s.observed, 2)}</td><td class="muted">{L.f.pct(s.expected, 2)}</td>
              <td>{pp(s.gap)}</td><td>{L.t['words.ratio'](times(s.score))}</td><td class="muted">{L.f.int(s.docs)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/snippet}

    {#snippet lead()}
    {#if narrow}
      <!-- phones: the cloud comes first; the year controls fold behind a one-line summary below it -->
      <details class="phone-years">
        <summary>{blockLabel} {L.t['words.s.vsShort']} {baselineLabel} · <span>{L.t['words.s.change']}</span></summary>
        {@render yearControls()}
      </details>
    {:else}
      {@render yearControls()}
    {/if}
    {/snippet}

    <div class="legend">
      <span class="lk rise">{L.t['words.more']}</span>
      <span class="lk fall">{L.t['words.less']}</span>
      {#if listRows.length}
        <span class="ramp">
          {#each SIZES as sz, i (i)}<span aria-hidden="true" style:font-size="{Math.max(11, sz * 0.75)}px">Aa</span>{/each}
          <small>{app.wordRank === 'gap'
            ? L.t['words.legend.gap'](L.f.num(ramp[0] * 100, 1), L.f.num(ramp[4] * 100, 1))
            : L.t['words.legend.ratio'](L.f.num(2 ** ramp[0], 1), L.f.num(2 ** ramp[4], 1))}</small>
        </span>
      {/if}
    </div>

    {#if cubeError}
      <p class="msg">{L.t['common.loadError']} <span class="detail">{cubeError}</span></p>
    {:else if !filters.fac.length || wordLang === null}
      <p class="msg">{L.t['common.empty']} <button type="button" class="fix" onclick={() => (app.fac = meta.faculties.map((_, i) => i))}>{L.t['common.selectAll']}</button></p>
    {:else if !cube || !result || !movers}
      <div class="skel" aria-busy="true"><span class="sr-only">{L.t['common.loading']}</span></div>
    {:else if result.reason === 'too-early'}
      <p class="msg">{L.t['words.thin']}</p>
    {:else if result.reason === 'no-target'}
      <p class="msg">{L.t['words.noTarget']}</p>
    {:else if result.reason === 'thin-baseline'}
      <p class="msg">{L.t['words.thin']}</p>
    {:else if !movers.rising.length && !movers.falling.length}
      <p class="msg">{L.t['words.none']}</p>
    {:else}
      {#if result.targetTotal < SMALL_TARGET}<p class="warn" role="status">{L.t['words.small'](result.targetTotal)}</p>{/if}
      <WordCloud rising={movers.rising} falling={movers.falling} {ramp} sizes={SIZES} {selected} onpick={pick} forms={useLemma ? formsOf : null} mode={app.wordRank} gloss={wantGloss ? gloss : null} />
    {/if}
  </Plate>

  <div bind:this={detailEl} class="detail-anchor">
  <Plate id="w-detail" title={selected ? L.t['words.detail.title'](selected) : L.t['words.detail.none']}
    unit={[selected && gloss(selected) ? `‘${gloss(selected)}’` : null,
      selected && useLemma && formsOf(selected).length ? `${L.t['words.detail.unitLemma']} · ${L.t['words.detail.forms'](formsOf(selected).join(', '))}` : L.t['words.detail.unit']].filter(Boolean).join(' · ')}>
    {#snippet tools()}
      <div class="search">
        <input type="search" bind:value={q} placeholder={L.t['words.search']} aria-label={L.t['words.search']}
          autocomplete="off" spellcheck="false"
          role="combobox" aria-expanded={q.trim().length >= 2} aria-controls="word-sugg" aria-autocomplete="list"
          aria-activedescendant={matches.length ? `sugg-${act}` : undefined}
          onkeydown={searchKey} />
        {#if q.trim().length >= 2}
          <ul class="sugg" id="word-sugg" role="listbox" aria-label={L.t['words.search']}>
            {#each matches as m, k (m.word)}
              <li id="sugg-{k}" role="option" aria-selected={k === act} class:act={k === act}>
                <button type="button" tabindex="-1" onclick={() => choose(m.word)}>{m.word}{#if gloss(m.word)}<span class="via"> ‘{gloss(m.word)}’</span>{/if}{#if m.via}<span class="via"> ← {m.via}</span>{/if}</button>
              </li>
            {:else}
              <li class="none">{L.t['words.search.noneWhy']}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/snippet}
    {#if !selected || !cube || !ctx || !result}
      <p class="msg empty">{app.word && cube && !cube.index.has(app.word) ? L.t['words.detail.notInVocab'] : L.t['words.detail.empty']}</p>
    {:else}
      <WordDetail {cube} {ctx} word={selected} {result} faculties={meta.faculties} yearFrom={meta.yearMin} yearTo={meta.yearMax} yearMax={meta.yearMax} />
    {/if}
  </Plate>
  </div>
</div>

<style>
  .words { display: flex; flex-direction: column; gap: var(--s6); }
  .words > :global(.lede) { margin-bottom: calc(-1 * var(--s3)); }
  .detail-anchor { scroll-margin-top: calc(var(--band-h, 58px) + 12px); }
  .lw { border: 0; background: none; padding: 0; font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: var(--rule); }
  .lw:hover { text-decoration-color: currentColor; }
  .fix { margin-left: 6px; border: 1px solid var(--ink-3); background: var(--paper); color: var(--ink); border-radius: 3px; padding: 3px 10px; font-size: var(--fs-sm); cursor: pointer; }
  .fix:hover { border-color: var(--ink); background: var(--paper-2); }
  .search { position: relative; }
  .search input {
    width: 200px; font-size: var(--fs-sm); color: var(--ink); background: var(--paper);
    border: 1px solid var(--rule); border-radius: 3px; padding: 4px 8px;
  }
  .search input:hover { border-color: var(--ink-3); }
  .search input::placeholder { color: var(--ink-3); }
  .sugg {
    position: absolute; z-index: 15; right: 0; top: calc(100% + 4px); min-width: 220px;
    list-style: none; margin: 0; padding: 4px 0;
    background: var(--paper); border: 1px solid var(--ink-3); border-radius: 3px; box-shadow: 0 6px 18px var(--shadow);
  }
  .sugg button { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 5px 10px; font-size: var(--fs-sm); color: var(--ink); cursor: pointer; }
  .sugg button:hover, .sugg button:focus-visible { background: var(--paper-2); outline: none; }
  .sugg .via { color: var(--ink-3); }
  .sugg li.act button { background: var(--petrol-tint); }
  .sugg .none { max-width: 300px; line-height: 1.45; }
  .phone-years { margin: var(--s3) 0 0; font-size: var(--fs-sm); color: var(--ink-2); }
  .phone-years > summary { cursor: pointer; padding: 10px 0; font-weight: 600; color: var(--ink); }
  .phone-years > summary span { color: var(--ink-2); text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 3px; }
  .more { font-size: var(--fs-sm); color: var(--ink-2); }
  .more summary { cursor: pointer; padding: 4px 0; text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 3px; }
  .more summary:hover { color: var(--ink); text-decoration-color: var(--ink); }
  .more[open] { flex-basis: 100%; }
  .more[open] summary { margin-bottom: 6px; }
  .opt-sum { color: var(--ink); font-weight: 600; }
  .opts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s4); padding: var(--s2) 0; }
  .frame { display: block; margin-top: 6px; font-size: var(--fs-md); color: var(--ink-2); font-weight: 400; }
  .hedge { color: var(--warn); font-weight: 600; }
  .sugg .none { padding: 5px 10px; font-size: var(--fs-sm); color: var(--ink-3); }
  .legend { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 18px; font-size: var(--fs-sm); margin-bottom: var(--s2); }
  .lk::before { content: ''; display: inline-block; width: 10px; height: 10px; margin-right: 6px; border-radius: 1px; vertical-align: -1px; }
  .lk.rise { color: var(--rise); font-weight: 700; }
  .lk.rise::before { background: var(--rise); }
  .lk.fall { color: var(--fall); }
  .lk.fall::before { background: var(--fall); }
  .ramp { display: inline-flex; align-items: baseline; gap: 6px; color: var(--ink-3); }
  .ramp span { line-height: 1; font-weight: 600; }
  .ramp small { font-size: var(--fs-xs); margin-left: 4px; }
  .msg { color: var(--ink-2); padding: var(--s5) 0; max-width: 70ch; }
  .msg.empty { color: var(--ink-3); padding: var(--s4) 0; }
  .detail { color: var(--ink-3); font-size: var(--fs-sm); }
  .warn { margin: 0 0 var(--s2); font-size: var(--fs-sm); color: var(--warn); font-weight: 600; }
  .skel { height: 380px; background: var(--paper-2); border-radius: 2px; animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.55; } }

  .compare { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s4); margin: var(--s2) 0; }
  .sentence { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: var(--fs-md); color: var(--ink-2); }
  .sentence select {
    font-size: var(--fs-md); font-weight: 600; color: var(--ink); background: var(--paper);
    border: 1px solid var(--rule); border-radius: 3px; padding: 2px 4px; cursor: pointer;
  }
  .sentence select:hover { border-color: var(--ink-3); }
  .player { display: inline-flex; gap: 4px; }
  @media (pointer: coarse) {
    .seg button, .player button { min-height: 40px; min-width: 44px; }
    .more summary { padding: 10px 0; }
    .search input { min-height: 40px; }
  }
  .player button {
    display: inline-flex; align-items: center; gap: 6px;
    border: 1px solid var(--rule); background: var(--paper); color: var(--ink);
    border-radius: 3px; padding: 4px 8px; font-size: var(--fs-sm); cursor: pointer;
    transition: border-color var(--t) var(--ease), background var(--t) var(--ease);
  }
  .player button:hover:not(:disabled) { border-color: var(--ink-3); background: var(--paper-2); }
  .player button:disabled { opacity: 0.4; cursor: default; }

  .mf { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; font-size: var(--fs-sm); color: var(--ink-2); }
  .mf input { width: 110px; accent-color: var(--petrol); }
  .mf output { min-width: 3.4em; font-weight: 600; color: var(--ink); }
  .seg { display: inline-flex; border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; }
  .seg button { border: 0; background: transparent; padding: 3px 10px; font-size: var(--fs-sm); cursor: pointer; color: var(--ink-2); }
  .seg button + button { border-left: 1px solid var(--rule); }
  .seg button[aria-pressed='true'] { background: var(--petrol); color: var(--on-petrol); }

  :global(td.forms) { text-align: left !important; white-space: normal; max-width: 32ch; }
  :global(th.forms-h) { text-align: left !important; }
  .wbtn { border: 0; background: none; padding: 0; cursor: pointer; font-size: inherit; text-align: left; }
  .wbtn.rise { color: var(--rise); font-weight: 700; }
  .wbtn.fall { color: var(--fall); }
  .wbtn[aria-pressed='true'] { text-decoration: underline; text-decoration-color: var(--ink); text-decoration-thickness: 2px; text-underline-offset: 3px; }
</style>
