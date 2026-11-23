<script lang="ts">
  import { line, scaleLinear } from 'd3';
  import { wordCounts, type ScoreResult, type WordContext } from '../../lib/data/excess';
  import { MIN_CELL_N, aiFilterActive } from '../../lib/data/select';
  import type { Faculty, WordCube } from '../../lib/data/types';
  import { CHATGPT_X, yearTicks } from '../../lib/chart';
  import { L } from '../../lib/locale.svelte';
  import { app } from '../../lib/state/app.svelte';
  import { YearDrag, resetZoom, zoomed } from '../../lib/state/zoom.svelte';

  interface Props {
    cube: WordCube; ctx: WordContext; word: string; result: ScoreResult;
    faculties: Faculty[]; yearFrom: number; yearTo: number; yearMax: number; aiYear: number;
  }
  let { cube, ctx, word, result, faculties, yearFrom, yearTo, yearMax, aiYear }: Props = $props();

  // faculty lines need more theses than trend cells: single-word shares are noisy
  const FAC_MIN = Math.max(50, MIN_CELL_N);
  const wi = $derived(cube.index.get(word)!);
  const counts = $derived(wordCounts(cube, ctx, wi));
  const from = $derived(Math.max(ctx.yearMin, Math.min(yearFrom, result.baseline[0] ?? result.from)));
  const yearsShown = $derived(Array.from({ length: yearTo - from + 1 }, (_, i) => from + i));

  const total = $derived(yearsShown.map((y) => {
    const yi = y - ctx.yearMin;
    let n = 0;
    for (const c of counts) n += c[yi];
    const d = ctx.total[yi];
    return { year: y, v: d ? n / d : NaN, n, d };
  }).filter((p) => p.d > 0));
  const perFac = $derived(ctx.facs.map((f, fi) => ({
    f,
    pts: yearsShown.map((y) => {
      const yi = y - ctx.yearMin;
      const d = ctx.denom[fi][yi];
      return { year: y, v: d >= FAC_MIN ? counts[fi][yi] / d : NaN };
    }).filter((p) => Number.isFinite(p.v)),
  })));
  const score = $derived(result.scores.find((s) => s.wi === wi) ?? null);
  const fit = $derived.by(() => {
    if (score) return score.fit;
    // word below min frequency: fit it anyway for the chart
    const pts = total.filter((p) => result.baseline.includes(p.year));
    if (pts.length < 2) return null;
    const mx = pts.reduce((s, p) => s + p.year, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.v, 0) / pts.length;
    let sxx = 0, sxy = 0;
    for (const p of pts) { sxx += (p.year - mx) ** 2; sxy += (p.year - mx) * (p.v - my); }
    const slope = sxx ? sxy / sxx : 0;
    return { slope, intercept: my - slope * mx };
  });
  // Target block: pooled observed share vs the trend extrapolated over the block (thesis-weighted)
  const T0 = $derived(result.from);
  const T1 = $derived(result.to);
  const T = $derived((T0 + T1) / 2);
  const block = $derived(total.filter((p) => p.year >= T0 && p.year <= T1));
  const blockD = $derived(block.reduce((s, p) => s + p.d, 0));
  const observed = $derived(blockD ? block.reduce((s, p) => s + p.n, 0) / blockD : NaN);
  const expected = $derived(fit && blockD
    ? block.reduce((s, p) => s + Math.max(0, fit.intercept + fit.slope * p.year) * p.d, 0) / blockD : NaN);
  const blockLabel = $derived(T0 === T1 ? `${T0}` : `${T0}–${T1}`);
  const shortSpan = (a: number, b: number) => (a === b ? `${a}` : `${a}–${String(b).slice(2)}`);

  let width = $state(800);
  // phones: the difference label moves under the chart, so the plot keeps its width
  const narrow = $derived(width < 480);
  const height = 300;
  const m = $derived({ top: 14, right: narrow ? 36 : 120, bottom: 24, left: narrow ? 44 : 52 });
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const ih = $derived(height - m.top - m.bottom);
  // the shared zoom narrows the visible years; everything drawn is clipped to the plot
  const span = $derived(zoomed(from, yearTo));
  const zf = $derived(span[0]);
  const zt = $derived(span[1]);
  const x = $derived(scaleLinear().domain([zf - 0.3, zt + 0.3]).range([0, iw]));
  const yMax = $derived(Math.max(
    // the simple version draws no faculty lines, so the scale follows the whole selection
    ...total.map((p) => p.v), ...(app.detailed ? perFac.flatMap((f) => f.pts.map((p) => p.v)) : []),
    Number.isFinite(expected) ? expected : 0, 0.001,
    // the dashed trend is drawn too, so it must fit inside the plot
    ...(fit && result.baseline.length ? [result.baseline[0], T1].map((yy) => fit.intercept + fit.slope * yy) : [])));
  const y = $derived(scaleLinear().domain([0, yMax * 1.08]).range([ih, 0]).nice(5));
  const gen = $derived(line<{ year: number; v: number }>().x((d) => x(d.year)).y((d) => y(d.v)));
  const solidPart = (pts: { year: number; v: number }[]) => pts.filter((p) => p.year < yearMax || p.year === pts[0]?.year);
  const tailPart = (pts: { year: number; v: number }[]) => (pts.length >= 2 && pts[pts.length - 1].year === yearMax ? pts.slice(-2) : []);
  const fitPts = $derived(fit && result.baseline.length
    ? [result.baseline[0], T1].map((yy) => ({ year: yy, v: Math.max(0, fit.intercept + fit.slope * yy) })) : []);
  const ticks = $derived(yearTicks(zf, zt, iw, 40));
  const pctTick = (v: number) => L.f.pct(v, v < 0.1 && yMax < 0.05 ? 1 : 0);

  let hoverYear: number | null = $state(null);
  const hp = $derived(hoverYear !== null ? total.find((p) => p.year === hoverYear) : undefined);
  const drag = new YearDrag();
  const clipId = $props.id();
  function fracYear(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    return Math.max(zf, Math.min(zt, x.invert(e.clientX - r.left - m.left)));
  }
  function onMove(e: PointerEvent) {
    const fy = fracYear(e);
    drag.move(fy);
    hoverYear = Math.round(fy);
  }
  function onKey(e: KeyboardEvent) {
    const cur = hoverYear ?? zt;
    if (e.key === 'ArrowLeft') hoverYear = Math.max(zf, cur - 1);
    else if (e.key === 'ArrowRight') hoverYear = Math.min(zt, cur + 1);
    else return;
    e.preventDefault();
  }
  // AI filter on: the year from which the selection is a different group (lines break there)
  const seam = $derived(aiFilterActive(app.ai) && yearTo >= aiYear ? aiYear : 0);
  // the incomplete last year: dotted, keyed in the legend and named at its end in both versions,
  // so a partial year's jump never reads as a finding
  const tail = $derived(tailPart(total));
  const diffPP = $derived(Number.isFinite(observed) && Number.isFinite(expected) ? (observed - expected) * 100 : NaN);
</script>

<div class="detail">
  <div class="readout" aria-live="polite">
    {#if hp}
      <span><b>{hp.year}</b></span>
      <span>{L.f.pct(hp.v, 2)}</span>
      <span class="muted">{L.f.int(hp.n)} / {L.f.int(hp.d)} {L.t['common.theses']}</span>
    {:else}
      <span><i class="k own"></i>{L.t['common.all']}</span>
      <span class="full-only"><i class="k ctx"></i>{L.t['words.detail.faculties']}</span>
      <span><i class="k fit"></i>{L.t['words.detail.fit']} {result.baseline[0]}–{result.baseline[result.baseline.length - 1]}</span>
      <span><i class="k dot hollow"></i>{L.t['words.detail.expected']}</span>
      <span><i class="k dot"></i>{L.t['words.detail.observedAvg'](blockLabel)}</span>
      {#if tail.length}<span><i class="k sofar"></i>{L.t['words.detail.soFar'](yearMax)}</span>{/if}
    {/if}
  </div>
  <div class="chart" bind:clientWidth={width}>
    <svg {width} {height} role="slider" tabindex="0"
      aria-valuemin={from} aria-valuemax={yearTo} aria-valuenow={hoverYear ?? T1}
      aria-valuetext={hp ? `${hp.year}: ${L.f.pct(hp.v, 2)}` : undefined}
      aria-label="{word}: {L.t['words.detail.observed']} {L.f.pct(observed, 2)}, {L.t['words.detail.expected']} {L.f.pct(expected, 2)} ({blockLabel})"
      onpointerdown={(e) => drag.begin(e, fracYear(e))} onpointerup={() => drag.end()} onpointercancel={() => drag.cancel()} ondblclick={resetZoom}
      onpointermove={onMove} onpointerleave={() => (hoverYear = null)} onkeydown={onKey} onblur={() => (hoverYear = null)}>
      <defs>
        <marker id="arrowhead" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--ink)" />
        </marker>
        <clipPath id="{clipId}-plot"><rect x="0" y="-14" width={iw} height={ih + 14} /></clipPath>
      </defs>
      <g transform="translate({m.left},{m.top})">
        {#each y.ticks(5) as t (t)}
          <line class="grid" x1="0" x2={iw} y1={y(t)} y2={y(t)} />
          <text x="-6" y={y(t)} dy="0.32em" text-anchor="end">{pctTick(t)}</text>
        {/each}
        {#each ticks as t (t)}<text x={x(t)} y={ih + 16} text-anchor="middle">{t}</text>{/each}
        <g clip-path="url(#{clipId}-plot)">
        {#if result.baseline.length}
          <rect class="base" x={x(result.baseline[0] - 0.5)} width={x(result.baseline[result.baseline.length - 1] + 0.5) - x(result.baseline[0] - 0.5)} y="0" height={ih} />
        {/if}
        <rect class="target" x={x(T0 - 0.5)} width={x(T1 + 0.5) - x(T0 - 0.5)} y="0" height={ih} />
        <!-- drawn over the shaded bands, so the label is not veiled by them -->
        <!-- the two compared periods, named on the chart itself -->
        {#if result.baseline.length}
          {@const b0 = Math.max(result.baseline[0], zf)}
          {@const b1 = Math.min(result.baseline[result.baseline.length - 1], zt)}
          <!-- narrow plots: short year spans ('2018–22') on one row, without the word "trend" -->
          {#if b1 >= b0}<text class="band-l" x={(x(b0 - 0.5) + x(b1 + 0.5)) / 2} y={ih - 6} text-anchor="middle">{narrow ? shortSpan(result.baseline[0], result.baseline[result.baseline.length - 1]) : L.t['words.detail.bandTrend'](`${result.baseline[0]}–${result.baseline[result.baseline.length - 1]}`)}</text>{/if}
        {/if}
        {#if Math.min(T1, zt) >= Math.max(T0, zf)}
          {@const tx = (x(Math.max(T0, zf) - 0.5) + x(Math.min(T1, zt) + 0.5)) / 2}
          {#if narrow}
            <text class="band-l" x={Math.min(iw, x(Math.min(T1, zt) + 0.5)) - 2} y={ih - 6} text-anchor="end">{shortSpan(T0, T1)}</text>
          {:else}
            <text class="band-l" x={tx} y={ih - 6} text-anchor="middle">{blockLabel}</text>
          {/if}
        {/if}
        {#if CHATGPT_X >= zf && CHATGPT_X <= zt}
          {@const mx = x(CHATGPT_X)}
          <line class="marker" x1={mx} x2={mx} y1="0" y2={ih} />
          <!-- near the right edge the label sits left of its line, so it is never clipped -->
          {#if mx > iw - 80}
            <text class="mlabel" x={mx - 4} y="10" text-anchor="end">{seam ? L.t['common.chatgptAi'] : L.t['common.chatgpt']}</text>
          {:else}
            <text class="mlabel" x={mx + 4} y="10">{seam ? L.t['common.chatgptAi'] : L.t['common.chatgpt']}</text>
          {/if}
        {/if}
        {#each app.detailed ? perFac : [] as f (f.f)}
          {#if f.pts.length > 1}<path class="ctx" d={gen(f.pts)} />{/if}
        {/each}
        {#if fitPts.length}<path class="fit" d={gen(fitPts)} />{/if}
        {#if seam}
          <!-- AI filter: from its first year the line follows a different group of theses, so it is broken there -->
          <path class="own" d={gen(total.filter((p) => p.year < seam))} />
          <path class="own" d={gen(solidPart(total.filter((p) => p.year >= seam)))} />
        {:else}
          <path class="own" d={gen(solidPart(total))} />
        {/if}
        {#if tail.length}<path class="own dotted" d={gen(tail)} />{/if}
        </g>

        {#if Number.isFinite(observed) && Number.isFinite(expected) && T1 <= zt && T1 >= zf}
          {@const x0 = x(T1) + (T1 > T0 ? 10 : 0)}
          {@const gap = Math.abs(y(observed) - y(expected))}
          {#if gap > 12}
            <line class="arrow" x1={x0 + 14} x2={x0 + 14} y1={y(expected)} y2={y(observed) + (observed > expected ? 6 : -6)} marker-end="url(#arrowhead)" />
          {/if}
          {#if T1 > T0}
            <line class="span exp-span" x1={x(T0 - 0.4)} x2={x(T1 + 0.4)} y1={y(expected)} y2={y(expected)} />
            <line class="span obs-span" x1={x(T0 - 0.4)} x2={x(T1 + 0.4)} y1={y(observed)} y2={y(observed)} />
          {/if}
          <circle class="exp" cx={x0} cy={y(expected)} r="5" />
          <circle class="obs" cx={x0} cy={y(observed)} r="5" />
          {#if !narrow}
            <text class="diff" class:up={diffPP > 0} class:down={diffPP < 0} x={x0 + 22} y={(y(observed) + y(expected)) / 2} dy="0.32em">
              <title>{L.t['words.diff.long'](L.f.signed(diffPP, 1))}</title>{L.t['words.diff'](L.f.signed(diffPP, 1))}
            </text>
            <text class="lbl" x={x0 + 22} y={(y(observed) + y(expected)) / 2} dy="1.6em">{L.f.pct(expected, 1)} → {L.f.pct(observed, 1)}</text>
          {/if}
        {/if}
        <!-- phones: the steep last stretch leaves no room for the label; the legend key names it -->
        {#if tail.length && yearMax <= zt && !narrow}
          {@const e = tail[tail.length - 1]}
          <text class="sofar-l" x={x(e.year) - 6} y={y(e.v)} dy="0.32em" text-anchor="end">{L.t['words.detail.soFar'](yearMax)}</text>
        {/if}
        {#if drag.active}<rect class="zsel" x={x(drag.lo)} width={Math.max(0, x(drag.hi) - x(drag.lo))} y="0" height={ih} />{/if}
        {#if hoverYear !== null}
          <line class="cursor" x1={x(hoverYear)} x2={x(hoverYear)} y1="0" y2={ih} />
          {#if hp}<circle class="hdot" cx={x(hoverYear)} cy={y(hp.v)} r="3.5" />{/if}
        {/if}
      </g>
    </svg>
  </div>
  {#if narrow && Number.isFinite(diffPP)}
    <p class="diff-line"><b class:up={diffPP > 0} class:down={diffPP < 0}>{L.t['words.diff.long'](L.f.signed(diffPP, 1))}</b> {blockLabel}: {L.f.pct(expected, 1)} → {L.f.pct(observed, 1)}</p>
  {/if}
  {#if hoverYear !== null && perFac.length > 1 && app.detailed}
    <p class="facs">
      {#each perFac as f (f.f)}
        {@const p = f.pts.find((q) => q.year === hoverYear)}
        {#if p}<span>{faculties[f.f].abbr} <b>{L.f.pct(p.v, 1)}</b></span>{/if}
      {/each}
    </p>
  {/if}
</div>

<style>
  .readout { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: var(--fs-sm); color: var(--ink-2); min-height: 22px; align-items: center; }
  .readout b { color: var(--ink); }
  .readout .muted { color: var(--ink-3); }
  .readout span { display: inline-flex; align-items: center; gap: 6px; }
  .k { display: inline-block; width: 16px; height: 2px; background: var(--ink); }
  .k.ctx { background: var(--context); height: 1px; }
  .k.fit { background: repeating-linear-gradient(90deg, var(--ink-2) 0 4px, transparent 4px 7px); }
  .k.sofar { background: repeating-linear-gradient(90deg, var(--ink) 0 2px, transparent 2px 5px); }
  .k.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ink); }
  .k.dot.hollow { background: var(--paper); box-shadow: inset 0 0 0 1.5px var(--ink); }
  svg { display: block; overflow: visible; cursor: crosshair; }
  svg:focus-visible { outline: 2px solid var(--petrol); outline-offset: 4px; }
  .grid { stroke: var(--rule-soft); shape-rendering: crispEdges; }
  .marker { stroke: var(--ink-3); stroke-dasharray: 2 3; }
  .mlabel { font-size: 12px; font-weight: 600; fill: var(--ink); paint-order: stroke; stroke: var(--paper); stroke-width: 3.5px; stroke-linejoin: round; }
  .base { fill: var(--paper-2); }
  /* the compared period: a neutral paper band (petrol is for selections only) */
  .target { fill: var(--paper-3); }
  .span { stroke-width: 2; }
  .exp-span { stroke: var(--ink-2); stroke-dasharray: 4 3; }
  /* the block's observed mean: a thick translucent ink bar, so it is not read as the word's own line (petrol stays 'selected' only) */
  .obs-span { stroke: var(--ink); stroke-width: 5; stroke-opacity: 0.4; stroke-linecap: butt; }
  path { fill: none; stroke-linejoin: round; stroke-linecap: round; }
  .ctx { stroke: var(--context); stroke-width: 1; stroke-opacity: 0.8; }
  .fit { stroke: var(--ink-2); stroke-width: 1.5; stroke-dasharray: 5 4; }
  .own { stroke: var(--ink); stroke-width: 2.4; }
  .own.dotted { stroke-dasharray: 1.5 3.5; }
  .exp { fill: var(--paper); stroke: var(--ink); stroke-width: 1.8; }
  .obs { fill: var(--ink); }
  .arrow { stroke: var(--ink); stroke-width: 1.3; }
  .diff { font-size: 13px; font-weight: 700; fill: var(--ink); }
  .diff.up { fill: var(--rise); }
  .diff.down { fill: var(--fall); }
  .sofar-l { font-size: 11px; font-weight: 600; fill: var(--ink-2); paint-order: stroke; stroke: var(--paper); stroke-width: 3.5px; stroke-linejoin: round; }
  .lbl { font-size: 11px; fill: var(--ink-3); }
  .band-l { font-size: 11px; font-weight: 600; fill: var(--ink-2); paint-order: stroke; stroke: var(--paper); stroke-width: 3px; stroke-linejoin: round; }
  .cursor { stroke: var(--ink-3); shape-rendering: crispEdges; }
  .hdot { fill: var(--ink); }
  .diff-line { margin: 2px 0 0; font-size: var(--fs-sm); color: var(--ink-2); }
  .diff-line b { color: var(--ink); }
  .diff-line b.up { color: var(--rise); }
  .diff-line b.down { color: var(--fall); }
  .facs { display: flex; flex-wrap: wrap; gap: 2px 14px; margin: 4px 0 0; font-size: var(--fs-xs); color: var(--ink-3); }
  .facs b { color: var(--ink); font-weight: 600; }
</style>
