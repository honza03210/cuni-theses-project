<script lang="ts">
  import { scaleLinear } from 'd3';
  import { CHATGPT_X, yearTicks, seriesPaths } from '../lib/chart';
  import { shareAtLeast, type SharePoint } from '../lib/data/playground';
  import type { Theses } from '../lib/data/types';
  import { L } from '../lib/locale.svelte';
  import Plate from '../lib/ui/Plate.svelte';
  import Tooltip from '../lib/ui/Tooltip.svelte';

  interface Props { t: Theses; counts: Uint16Array }
  let { t, counts }: Props = $props();

  const q = new URLSearchParams(location.search);
  const N_MAX = 50;
  let atLeast = $state(Math.min(N_MAX, Math.max(1, Number(q.get('n')) || 3)));
  let facCode = $state(q.get('f') ?? '');
  const fac = $derived.by(() => { const i = t.meta.faculties.findIndex((f) => f.code === facCode); return i < 0 ? null : i; });

  $effect(() => {
    const u = new URL(location.href);
    u.searchParams.set('n', String(atLeast));
    if (facCode) u.searchParams.set('f', facCode); else u.searchParams.delete('f');
    history.replaceState(null, '', u);
  });

  // Czech solid ink, English dashed secondary ink: identity by dash + direct label, not colour
  const SERIES = [
    { lang: 0, color: 'var(--ink)', dash: '' },
    { lang: 1, color: 'var(--ink-2)', dash: '7 4' },
  ];
  const series = $derived(SERIES.map((s) => ({ ...s, pts: shareAtLeast(t, counts, atLeast, s.lang, fac) })));

  let width = $state(0);
  const narrow = $derived(width < 560);
  const height = $derived(narrow ? 280 : 360);
  const m = $derived({ top: 14, right: narrow ? 12 : 112, bottom: 26, left: 44 });
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const ih = $derived(height - m.top - m.bottom);
  const yearMin = $derived(t.meta.yearMin);
  const yearMax = $derived(t.meta.yearMax);
  const x = $derived(scaleLinear().domain([yearMin - 0.3, yearMax + 0.3]).range([0, iw]));
  const yMax = $derived(Math.max(0.01, ...series.flatMap((s) => s.pts.map((p) => p.hi))));
  const y = $derived(scaleLinear().domain([0, yMax]).range([ih, 0]).nice(5));
  const yTicks = $derived(y.ticks(5));
  const yDec = $derived(y.domain()[1] <= 0.05 ? 1 : 0);
  const xTicks = $derived(yearTicks(yearMin, yearMax, iw, 44));

  const band = (pts: SharePoint[]) => {
    // break the band at missing years, like the lines
    let d = '', run: SharePoint[] = [];
    const flush = () => {
      if (run.length >= 2) d += 'M' + run.map((p) => `${x(p.year)},${y(p.hi)}`).join('L') + 'L' + [...run].reverse().map((p) => `${x(p.year)},${y(p.lo)}`).join('L') + 'Z';
      run = [];
    };
    for (const p of pts) { if (run.length && p.year - run[run.length - 1].year > 1) flush(); run.push(p); }
    flush();
    return d;
  };
  const drawn = $derived(series.map((s) => ({
    ...s,
    band: band(s.pts),
    paths: seriesPaths(s.pts.map((p) => ({ year: p.year, v: p.share })), x, y, yearMax),
    last: s.pts.length ? s.pts[s.pts.length - 1] : null,
  })));
  // end labels: keep at least one line apart
  const labelY = $derived.by(() => {
    const ys = drawn.map((s) => (s.last ? y(s.last.share) : NaN));
    if (ys.every(Number.isFinite) && Math.abs(ys[0] - ys[1]) < 16) {
      const mid = (ys[0] + ys[1]) / 2, up = ys[0] <= ys[1] ? -1 : 1;
      ys[0] = mid + up * 8; ys[1] = mid - up * 8;
    }
    return ys;
  });

  let hoverYear = $state<number | null>(null);
  let tip = $state({ x: 0, y: 0 });
  function move(e: PointerEvent) {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const yr = Math.round(x.invert(e.clientX - r.left));
    hoverYear = yr >= yearMin && yr <= yearMax ? yr : null;
    tip = { x: e.clientX, y: e.clientY };
  }
  const hoverRows = $derived(hoverYear === null ? [] : drawn.map((s) => ({ s, p: s.pts.find((p) => p.year === hoverYear) })));
  const pct = (v: number, d = 1) => L.f.pct(v, d);
  const label = (lang: number) => L.t[`play.em.lang.${lang}` as 'play.em.lang.0'];
</script>

<Plate id="emdash" title={L.t['play.em.title'](atLeast)} unit={L.t['play.em.unit']} foot={L.t['play.em.foot']}>
  {#snippet lead()}
    <div class="controls">
      <div class="stepper" role="group" aria-label={L.t['play.em.atLeast']}>
        <span class="lab">{L.t['play.em.atLeast']}</span>
        <button type="button" aria-label={L.t['play.em.minus']} disabled={atLeast <= 1} onclick={() => atLeast--}>−</button>
        <input type="number" min="1" max={N_MAX} bind:value={atLeast} aria-label={L.t['play.em.dashes'](atLeast)}
          onchange={() => (atLeast = Math.min(N_MAX, Math.max(1, Math.round(atLeast || 1))))} />
        <button type="button" aria-label={L.t['play.em.plus']} disabled={atLeast >= N_MAX} onclick={() => atLeast++}>+</button>
        <span class="lab">{L.t['play.em.dashes'](atLeast)}</span>
      </div>
      <label class="fac">
        <span class="lab">{L.t['play.em.fac']}</span>
        <select bind:value={facCode}>
          <option value="">{L.t['play.em.allFac']}</option>
          {#each t.meta.faculties as f (f.code)}<option value={f.code}>{f.abbr} · {L.pick(f.name)}</option>{/each}
        </select>
      </label>
    </div>
  {/snippet}

  {#snippet table()}
    <table>
      <thead>
        <tr><th scope="col">{L.t['play.em.year']}</th>
          {#each series as s (s.lang)}<th scope="col">{label(s.lang)}: {L.t['play.em.share']}</th><th scope="col">{L.t['play.em.count']}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each Array.from({ length: yearMax - yearMin + 1 }, (_, i) => yearMin + i) as yr (yr)}
          <tr><th scope="row">{yr}</th>
            {#each series as s (s.lang)}
              {@const p = s.pts.find((p) => p.year === yr)}
              <td>{p ? pct(p.share) : '–'}</td><td>{p ? L.t['play.em.tip'](L.f.int(p.k), L.f.int(p.n)) : '–'}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/snippet}

  <div class="chart" bind:clientWidth={width}>
    <p class="key">
      {#each SERIES as s (s.lang)}
        <span><svg width="28" height="10" aria-hidden="true"><line x1="0" x2="28" y1="5" y2="5" stroke={s.color} stroke-width="2" stroke-dasharray={s.dash} /></svg>{label(s.lang)}</span>
      {/each}
      <span><svg width="16" height="10" aria-hidden="true"><rect width="16" height="10" fill="var(--ink)" opacity="0.1" /></svg>{L.t['play.em.band']}</span>
    </p>
    {#if width > 0}
      <svg {width} {height} role="img" aria-label={L.t['play.em.title'](atLeast)}>
        <g transform="translate({m.left},{m.top})">
          {#each yTicks as v (v)}
            <line class="grid" x1="0" x2={iw} y1={y(v)} y2={y(v)} />
            <text class="tick" x="-6" y={y(v)} dy="0.32em" text-anchor="end">{pct(v, yDec)}</text>
          {/each}
          {#each xTicks as yr (yr)}
            <text class="tick" x={x(yr)} y={ih + 18} text-anchor="middle">{yr}</text>
          {/each}
          <line class="base" x1="0" x2={iw} y1={ih} y2={ih} />

          <line class="gpt" x1={x(CHATGPT_X)} x2={x(CHATGPT_X)} y1="0" y2={ih} />
          <text class="gpt-l" x={x(CHATGPT_X) - 4} y="10" text-anchor="end">{L.t['common.chatgpt']}</text>

          {#each drawn as s (s.lang)}
            <path d={s.band} fill={s.color} opacity="0.1" />
          {/each}
          {#each drawn as s (s.lang)}
            <path d={s.paths.solid} fill="none" stroke={s.color} stroke-width="2" stroke-dasharray={s.dash} stroke-linejoin="round" />
            <path d={s.paths.dotted} fill="none" stroke={s.color} stroke-width="2" stroke-dasharray="1.5 3.5" stroke-linecap="round" />
            {#each s.paths.singles as p (p.year)}<circle cx={x(p.year)} cy={y(p.v)} r="3" fill={s.color} />{/each}
          {/each}
          {#if !narrow}
            {#each drawn as s, i (s.lang)}
              {#if s.last}
                <text class="end" x={x(s.last.year) + 8} y={labelY[i]} dy="0.32em">{label(s.lang)} {pct(s.last.share)}</text>
              {/if}
            {/each}
          {/if}

          {#if hoverYear !== null}
            <line class="cross" x1={x(hoverYear)} x2={x(hoverYear)} y1="0" y2={ih} />
            {#each hoverRows as r (r.s.lang)}
              {#if r.p}<circle cx={x(r.p.year)} cy={y(r.p.share)} r="4" fill={r.s.color} stroke="var(--paper)" stroke-width="2" />{/if}
            {/each}
          {/if}
          <rect class="hit" width={iw} height={ih} role="presentation"
            onpointermove={move} onpointerdown={move} onpointerleave={() => (hoverYear = null)} />
        </g>
      </svg>
    {/if}
  </div>
</Plate>

{#if hoverYear !== null}
  <Tooltip x={tip.x} y={tip.y}>
    <strong>{hoverYear}{hoverYear === yearMax ? ' *' : ''}</strong>
    {#each hoverRows as r (r.s.lang)}
      <div class="tip-row">
        <span>{label(r.s.lang)}</span>
        <span>{r.p ? `${pct(r.p.share)} · ${L.t['play.em.tip'](L.f.int(r.p.k), L.f.int(r.p.n))}` : '–'}</span>
      </div>
    {/each}
  </Tooltip>
{/if}

<style>
  .controls { display: flex; flex-wrap: wrap; gap: var(--s3) var(--s5); align-items: center; font-size: var(--fs-sm); }
  .lab { color: var(--ink-2); font-weight: 600; }
  .stepper { display: inline-flex; align-items: center; gap: var(--s2); }
  .stepper button, .stepper input, select {
    font: inherit; color: var(--ink); background: var(--paper); border: 1px solid var(--rule); border-radius: 3px; min-height: 32px;
  }
  .stepper button { width: 32px; cursor: pointer; font-size: var(--fs-lg); line-height: 1; }
  .stepper button:hover:not(:disabled) { background: var(--paper-3); }
  .stepper button:disabled { color: var(--ink-3); cursor: default; opacity: 0.6; }
  .stepper input { width: 3.5em; text-align: center; padding: 0 4px; }
  .fac { display: inline-flex; align-items: center; gap: var(--s2); }
  select { padding: 0 6px; max-width: min(320px, 70vw); }
  @media (pointer: coarse) { .stepper button, .stepper input, select { min-height: 44px; } .stepper button { width: 44px; } }

  .chart { position: relative; }
  .key { display: flex; flex-wrap: wrap; gap: var(--s2) var(--s4); margin: 0 0 var(--s2); font-size: var(--fs-sm); color: var(--ink-2); }
  .key span { display: inline-flex; align-items: center; gap: 6px; }
  svg { display: block; overflow: visible; }
  .grid { stroke: var(--rule-soft); }
  .base { stroke: var(--ink-3); }
  .tick { font-size: 11px; fill: var(--ink-3); }
  .gpt { stroke: var(--ink-3); stroke-dasharray: 2 3; }
  .gpt-l { font-size: 11px; fill: var(--ink-3); }
  .end { font-size: var(--fs-sm); fill: var(--ink-2); font-weight: 600; }
  .cross { stroke: var(--ink-3); }
  .hit { fill: transparent; cursor: crosshair; touch-action: pan-y; }
  .tip-row { display: flex; justify-content: space-between; gap: var(--s4); font-size: var(--fs-sm); }
  table { border-collapse: collapse; font-size: var(--fs-sm); width: 100%; }
  th, td { padding: 4px 10px; text-align: right; border-bottom: 1px solid var(--rule-soft); white-space: nowrap; }
  th:first-child { text-align: left; }
  thead th { color: var(--ink-2); font-weight: 600; border-bottom-color: var(--rule); }
</style>
