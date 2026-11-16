<script lang="ts">
  import { loadWordCube } from '../../lib/data/load';
  import { buildWordContext, clampComparison, rampFor, scoreWords, topMovers, BASE_MAX, BASE_MIN, type Comparison } from '../../lib/data/excess';
  import { onDestroy } from 'svelte';
  import { aiFilterActive } from '../../lib/data/select';
  import type { Filters, Theses, WordCube } from '../../lib/data/types';
  import { app } from '../../lib/state/app.svelte';
  import { L } from '../../lib/locale.svelte';
  import Plate from '../../lib/ui/Plate.svelte';
  import WordCloud from './WordCloud.svelte';
  import WordDetail from './WordDetail.svelte';
  import WordTimeline from './WordTimeline.svelte';

  interface Props { theses: Theses; filters: Filters }
  let { theses, filters }: Props = $props();

  const meta = $derived(theses.meta);
  const MIN_FREQ_STEPS = [0.002, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1];
  const SMALL_TARGET = 100;
  const N_EACH = 40;

  const wordLang = $derived(app.wordLang !== null && app.langs.includes(app.wordLang) ? app.wordLang : app.langs[0] ?? null);

  let cube = $state.raw<WordCube | null>(null);
  let cubeError: string | null = $state(null);
  $effect(() => {
    const li = wordLang;
    if (li === null) { cube = null; return; }
    let alive = true;
    cubeError = null;
    if (cube?.langIndex !== li) cube = null;
    loadWordCube(meta.langs[li], li)
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
  const movers = $derived(result ? topMovers(result.scores, N_EACH) : null);
  const blockLabel = $derived(cmp.from === cmp.to ? `${cmp.from}` : `${cmp.from}–${cmp.to}`);
  const baselineLabel = $derived(`${cmp.from - cmp.base}–${cmp.from - 1}`);
  const totals = $derived(ctx ? ctx.total : new Array(meta.yearMax - meta.yearMin + 1).fill(0));
  const fromYears = $derived(Array.from({ length: meta.yearMax - (meta.yearMin + BASE_MIN) + 1 }, (_, i) => meta.yearMin + BASE_MIN + i));
  const toYears = $derived(fromYears.filter((y) => y >= cmp.from));
  const baseOptions = $derived(Array.from({ length: BASE_MAX - BASE_MIN + 1 }, (_, i) => BASE_MIN + i).filter((b) => cmp.from - b >= meta.yearMin));

  // step / play through the years, keeping the block length
  const len = $derived(cmp.to - cmp.from);
  const canBack = $derived(cmp.from - 1 - cmp.base >= meta.yearMin || cmp.base > BASE_MIN);
  const canFwd = $derived(cmp.to < meta.yearMax);
  function stepBy(d: number) { setCmp({ ...cmp, from: cmp.from + d, to: cmp.to + d }); }
  let timer: ReturnType<typeof setInterval> | null = $state(null);
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function play() {
    if (timer) { stop(); return; }
    // the last year is incomplete: playback ends at the last complete year
    const end = meta.yearMax - 1;
    if (cmp.to >= end) setCmp({ ...cmp, from: meta.yearMin + cmp.base, to: meta.yearMin + cmp.base + len });
    timer = setInterval(() => {
      if (cmp.to >= end) { stop(); return; }
      stepBy(1);
    }, 1600);
  }
  onDestroy(stop);
  const mfIndex = $derived(Math.max(0, MIN_FREQ_STEPS.findIndex((v) => v >= app.minFreq - 1e-9)));

  const selected = $derived(app.word && cube && cube.index.has(app.word) ? app.word : null);
  function pick(w: string) { app.word = app.word === w ? null : w; }

  const listRows = $derived(movers ? [...movers.rising, ...movers.falling] : []);
  const ramp = $derived(rampFor(listRows.map((r) => r.score)));
  const SIZES = [13, 16, 21, 28, 38];
</script>

<div class="words">
  <Plate id="w-cloud" title={L.t['words.cloud.title']} unit={L.t['words.cloud.unit'](blockLabel, baselineLabel)} foot={L.t['words.cloud.foot']}>
    {#snippet tools()}
      {#if app.langs.length > 1}
        <div class="seg" role="group" aria-label={L.t['words.lang']}>
          {#each app.langs as li (li)}
            <button type="button" aria-pressed={li === wordLang} onclick={() => (app.wordLang = li)}>{meta.langs[li]}</button>
          {/each}
        </div>
      {/if}
      <label class="mf">
        <span>{L.t['words.minFreq']}</span>
        <input type="range" min="0" max={MIN_FREQ_STEPS.length - 1} step="1" value={mfIndex}
          aria-valuetext={L.f.pct(MIN_FREQ_STEPS[mfIndex])}
          oninput={(e) => (app.minFreq = MIN_FREQ_STEPS[+e.currentTarget.value])} />
        <output>{L.f.pct(app.minFreq, app.minFreq < 0.01 ? 1 : 0)}</output>
      </label>
    {/snippet}
    {#snippet table()}
      <table>
        <thead><tr><th>{L.t['words.col.word']}</th><th>{L.t['words.col.obs']}</th><th>{L.t['words.col.exp']}</th><th>{L.t['words.col.ratio']}</th><th>{L.t['words.col.docs']}</th></tr></thead>
        <tbody>
          {#each listRows as s (s.word)}
            <tr>
              <td><button type="button" class="wbtn" class:rise={s.score > 0} class:fall={s.score < 0} aria-pressed={selected === s.word} onclick={() => pick(s.word)}>{s.word}</button></td>
              <td>{L.f.pct(s.observed, 2)}</td><td class="muted">{L.f.pct(s.expected, 2)}</td>
              <td>{L.f.signed(s.score, 2)}</td><td class="muted">{L.f.int(s.docs)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/snippet}

    <div class="compare">
      <div class="sentence">
        <span>{L.t['words.s.compare']}</span>
        <select aria-label={L.t['words.s.from']} value={cmp.from} onchange={(e) => { stop(); setCmp({ ...cmp, from: +e.currentTarget.value, to: Math.max(+e.currentTarget.value, cmp.to) }); }}>
          {#each fromYears as y (y)}<option value={y}>{y}</option>{/each}
        </select>
        <span>–</span>
        <select aria-label={L.t['words.s.to']} value={cmp.to} onchange={(e) => { stop(); setCmp({ ...cmp, to: +e.currentTarget.value }); }}>
          {#each toYears as y (y)}<option value={y}>{y}{y === meta.yearMax ? ` (${L.t['words.incomplete']})` : ''}</option>{/each}
        </select>
        <span>{L.t['words.s.with']}</span>
        <select aria-label={L.t['words.s.base']} value={cmp.base} onchange={(e) => { stop(); setCmp({ ...cmp, base: +e.currentTarget.value }); }}>
          {#each baseOptions as b (b)}<option value={b}>{b}</option>{/each}
        </select>
        <span>{L.t['words.s.years'](baselineLabel)}</span>
      </div>
      <div class="player" role="group" aria-label={L.t['words.s.player']}>
        <button type="button" disabled={!canBack} onclick={() => { stop(); stepBy(-1); }} title={L.t['words.s.prev']} aria-label={L.t['words.s.prev']}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="play" aria-pressed={!!timer} onclick={play} title={timer ? L.t['words.s.pause'] : L.t['words.s.play']}>
          {#if timer}
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9M11 3.5v9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.5 8z" fill="currentColor"/></svg>
          {/if}
          <span>{timer ? L.t['words.s.pause'] : L.t['words.s.play']}</span>
        </button>
        <button type="button" disabled={!canFwd} onclick={() => { stop(); stepBy(1); }} title={L.t['words.s.next']} aria-label={L.t['words.s.next']}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
    <WordTimeline yearMin={meta.yearMin} yearMax={meta.yearMax} {totals} {cmp} onchange={(c) => { stop(); setCmp(c); }} />

    <div class="legend">
      <span class="lk rise">{L.t['words.more']}</span>
      <span class="lk fall">{L.t['words.less']}</span>
      {#if listRows.length}
        <span class="ramp">
          {#each SIZES as sz, i (i)}<span aria-hidden="true" style:font-size="{sz * 0.75}px">Aa</span>{/each}
          <small>|log₂| {L.f.num(ramp[0], 2)} → {L.f.num(ramp[4], 2)}+</small>
        </span>
      {/if}
    </div>

    {#if cubeError}
      <p class="msg">{L.t['common.loadError']} <span class="detail">{cubeError}</span></p>
    {:else if !filters.fac.length || wordLang === null}
      <p class="msg">{L.t['common.empty']}</p>
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
      <WordCloud rising={movers.rising} falling={movers.falling} {ramp} sizes={SIZES} {selected} onpick={pick} />
    {/if}
  </Plate>

  <Plate id="w-detail" title={selected ? L.t['words.detail.title'](selected) : L.t['words.detail.none']} unit={L.t['words.detail.unit']}>
    {#if !selected || !cube || !ctx || !result}
      <p class="msg empty">{app.word && cube && !cube.index.has(app.word) ? L.t['words.detail.notInVocab'] : L.t['words.detail.empty']}</p>
    {:else}
      <WordDetail {cube} {ctx} word={selected} {result} faculties={meta.faculties} yearFrom={meta.yearMin} yearTo={meta.yearMax} yearMax={meta.yearMax} />
    {/if}
  </Plate>
</div>

<style>
  .words { display: flex; flex-direction: column; gap: var(--s6); }
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

  .compare { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s2) var(--s4); margin-bottom: var(--s2); }
  .sentence { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: var(--fs-md); color: var(--ink-2); }
  .sentence select {
    font-size: var(--fs-md); font-weight: 600; color: var(--ink); background: var(--paper);
    border: 1px solid var(--rule); border-radius: 3px; padding: 2px 4px; cursor: pointer;
  }
  .sentence select:hover { border-color: var(--ink-3); }
  .player { display: inline-flex; gap: 4px; }
  .player button {
    display: inline-flex; align-items: center; gap: 6px;
    border: 1px solid var(--rule); background: var(--paper); color: var(--ink);
    border-radius: 3px; padding: 4px 8px; font-size: var(--fs-sm); cursor: pointer;
    transition: border-color var(--t) var(--ease), background var(--t) var(--ease);
  }
  .player button:hover:not(:disabled):not([aria-pressed='true']) { border-color: var(--ink-3); background: var(--paper-2); }
  .player button:disabled { opacity: 0.4; cursor: default; }
  .player .play { min-width: 92px; justify-content: center; }
  .player .play[aria-pressed='true'] { background: var(--petrol); border-color: var(--petrol); color: var(--on-petrol); }
  .mf { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; font-size: var(--fs-sm); color: var(--ink-2); }
  .mf input { width: 110px; accent-color: var(--petrol); }
  .mf output { min-width: 3.4em; font-weight: 600; color: var(--ink); }
  .seg { display: inline-flex; border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; }
  .seg button { border: 0; background: transparent; padding: 3px 10px; font-size: var(--fs-sm); cursor: pointer; color: var(--ink-2); }
  .seg button + button { border-left: 1px solid var(--rule); }
  .seg button[aria-pressed='true'] { background: var(--petrol); color: var(--on-petrol); }

  .wbtn { border: 0; background: none; padding: 0; cursor: pointer; font-size: inherit; text-align: left; }
  .wbtn.rise { color: var(--rise); font-weight: 700; }
  .wbtn.fall { color: var(--fall); }
  .wbtn[aria-pressed='true'] { text-decoration: underline; text-decoration-color: var(--petrol); text-decoration-thickness: 2px; text-underline-offset: 3px; }
</style>
