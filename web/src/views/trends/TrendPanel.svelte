<script lang="ts">
  import { precisionFixed, scaleLinear } from 'd3';
  import type { MetricSeries, Point } from '../../lib/data/aggregate';
  import type { Faculty, MetricMeta } from '../../lib/data/types';
  import { CHATGPT_X, bandPath, seriesPaths, yearTicks } from '../../lib/chart';
  import { ui } from '../../lib/state/app.svelte';
  import { L } from '../../lib/locale.svelte';

  interface Props {
    fac: number;
    faculty: Faculty;
    faculties: Faculty[];
    series: MetricSeries;
    facs: number[];
    yDomain: [number, number];
    metric: MetricMeta;
    yearFrom: number;
    yearTo: number;
    yearMax: number;
    aiYear: number;
    aiOn: boolean;
    uniRef: Point[] | null;
    large: boolean;
    first?: boolean;
    showOthers?: boolean;
  }
  let { fac, faculty, faculties, series, facs, yDomain, metric, yearFrom, yearTo, yearMax, aiYear, aiOn, uniRef, large, first = false, showOthers = true }: Props = $props();

  let width = $state(260);
  const height = $derived(large ? 380 : 168);
  const m = { top: 8, right: 10, bottom: 22, left: 38 };
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const ih = $derived(height - m.top - m.bottom);
  const x = $derived(scaleLinear().domain([yearFrom - 0.25, Math.max(yearTo, yearFrom + 1) + 0.25]).range([0, iw]));
  const y = $derived(scaleLinear().domain(yDomain).range([ih, 0]).nice(4));
  const yTicks = $derived(y.ticks(large ? 6 : 4));
  const tickDec = $derived(yTicks.length > 1 ? precisionFixed(yTicks[1] - yTicks[0]) : metric.decimals);
  const xTicks = $derived(yearTicks(yearFrom, yearTo, iw, large ? 44 : 40));

  const toV = (pts: Point[]) => pts.map((p) => ({ year: p.year, v: p.mean }));
  const own = $derived(series.byFac.get(fac) ?? []);
  const ownPaths = $derived(seriesPaths(toV(own), x, y, yearMax));
  const avgPaths = $derived(seriesPaths(toV(series.overall), x, y, yearMax));
  const uniPaths = $derived(uniRef ? seriesPaths(toV(uniRef), x, y, yearMax) : null);
  const others = $derived(facs.filter((f) => f !== fac).map((f) => ({ f, p: seriesPaths(toV(series.byFac.get(f) ?? []), x, y, yearMax) })));
  const band = $derived(bandPath(own, x, y));

  const hoverOther = $derived(ui.hoverFac !== null && ui.hoverFac !== fac && facs.includes(ui.hoverFac) ? ui.hoverFac : null);
  const hoverPaths = $derived(hoverOther !== null ? others.find((o) => o.f === hoverOther)?.p ?? null : null);

  // readout: hovered or keyboard-focused year
  let readYear: number | null = $state(null);
  const readOwn = $derived(readYear !== null ? own.find((p) => p.year === readYear) : undefined);
  const readAvg = $derived(readYear !== null ? series.overall.find((p) => p.year === readYear) : undefined);
  const readHover = $derived(readYear !== null && hoverOther !== null ? series.byFac.get(hoverOther)?.find((p) => p.year === readYear) : undefined);
  const fmtV = (v: number) => L.f.num(v, metric.decimals);

  function onMove(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left - m.left;
    const py = e.clientY - rect.top - m.top;
    const yr = Math.round(x.invert(px));
    readYear = Math.max(yearFrom, Math.min(yearTo, yr));
    // nearest other faculty line at this year -> shared hover across panels
    let best: number | null = null, bestD = 14;
    for (const f of facs) {
      if (f === fac) continue;
      const p = series.byFac.get(f)?.find((q) => q.year === readYear);
      if (!p) continue;
      const d = Math.abs(y(p.mean) - py);
      if (d < bestD) { bestD = d; best = f; }
    }
    ui.hoverFac = best;
  }
  function onLeave() { readYear = null; ui.hoverFac = null; }
  function onKey(e: KeyboardEvent) {
    const cur = readYear ?? yearTo;
    if (e.key === 'ArrowLeft') readYear = Math.max(yearFrom, cur - 1);
    else if (e.key === 'ArrowRight') readYear = Math.min(yearTo, cur + 1);
    else if (e.key === 'Escape') readYear = null;
    else return;
    e.preventDefault();
  }
  const label = $derived(`${faculty.abbr}, ${L.pick(metric.label)}`);
</script>

<figure class="panel" class:large>
  <figcaption>
    <span class="abbr" title={L.pick(faculty.name)}>{faculty.abbr}</span>
    <span class="readout" aria-live="polite">
      {#if readYear !== null}
        <span class="ry">{readYear}</span>
        <span class="rv"><i class="k own"></i>{readOwn ? fmtV(readOwn.mean) : '–'}{#if readOwn}<small> n={L.f.int(readOwn.n)}</small>{/if}</span>
        <span class="rv"><i class="k avg"></i>{readAvg ? fmtV(readAvg.mean) : '–'}</span>
        {#if readHover && hoverOther !== null}<span class="rv"><i class="k hov"></i>{faculties[hoverOther].abbr} {fmtV(readHover.mean)}</span>{/if}
      {:else}
        <span class="name">{L.pick(faculty.name)}</span>
      {/if}
    </span>
  </figcaption>
  <div class="chart" bind:clientWidth={width}>
    <svg {width} {height} role="slider" aria-label={label} tabindex="0"
      aria-valuemin={yearFrom} aria-valuemax={yearTo} aria-valuenow={readYear ?? yearTo}
      aria-valuetext={readYear !== null && readOwn ? `${readYear}: ${fmtV(readOwn.mean)}` : faculty.abbr}
      onpointermove={onMove} onpointerleave={onLeave} onkeydown={onKey} onblur={() => (readYear = null)}>
      <g transform="translate({m.left},{m.top})">
        {#each yTicks as t (t)}
          <line class="grid" x1="0" x2={iw} y1={y(t)} y2={y(t)} />
          <text x="-6" y={y(t)} dy="0.32em" text-anchor="end">{L.f.num(t, tickDec)}</text>
        {/each}
        {#each xTicks as t (t)}
          <text x={x(t)} y={ih + 15} text-anchor="middle">{large ? t : `'${String(t).slice(2)}`}</text>
        {/each}

        {#if CHATGPT_X >= yearFrom && CHATGPT_X <= yearTo + 0.25}
          <line class="marker" x1={x(CHATGPT_X)} x2={x(CHATGPT_X)} y1="0" y2={ih} />
          {#if large || first}<text class="mlabel" x={x(CHATGPT_X) - 3} y="9" text-anchor="end">{L.t['common.chatgpt']}</text>{/if}
        {/if}
        {#if aiOn && aiYear >= yearFrom}
          <line class="marker ai" x1={x(aiYear - 0.5)} x2={x(aiYear - 0.5)} y1="0" y2={ih} />
          {#if large || first}<text class="mlabel ai" x={x(aiYear - 0.5) - 4} y="24" text-anchor="end">{L.t['common.aiStart']}</text>{/if}
        {/if}

        {#if showOthers}
          {#each others as o (o.f)}
            <path class="other" d={o.p.solid} />
            <path class="other dotted" d={o.p.dotted} />
          {/each}
        {/if}
        {#if uniPaths}
          <path class="other uni" d={uniPaths.solid} />
          <path class="other uni dotted" d={uniPaths.dotted} />
        {/if}
        <path class="band" d={band} />
        {#if !uniPaths}
          <path class="avg" d={avgPaths.solid} />
          <path class="avg dotted" d={avgPaths.dotted} />
        {/if}
        {#if hoverPaths}
          <path class="hover" d={hoverPaths.solid} />
          <path class="hover dotted" d={hoverPaths.dotted} />
        {/if}
        <path class="own" d={ownPaths.solid} />
        <path class="own dotted" d={ownPaths.dotted} />
        {#each ownPaths.singles as s (s.year)}<circle class="own-dot" cx={x(s.year)} cy={y(s.v)} r="2.5" />{/each}

        {#if readYear !== null}
          <line class="cursor" x1={x(readYear)} x2={x(readYear)} y1="0" y2={ih} />
          {#if readOwn}<circle class="own-dot" cx={x(readYear)} cy={y(readOwn.mean)} r="3.5" />{/if}
        {/if}
      </g>
    </svg>
  </div>
</figure>

<style>
  .panel { margin: 0; min-width: 0; }
  figcaption {
    display: flex; align-items: baseline; gap: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--rule);
    min-height: 26px;
    overflow: hidden;
  }
  .abbr { font-weight: 700; font-size: var(--fs-md); flex: none; }
  .readout { display: flex; gap: 10px; align-items: baseline; font-size: var(--fs-xs); color: var(--ink-2); min-width: 0; white-space: nowrap; }
  .name { overflow: hidden; text-overflow: ellipsis; color: var(--ink-3); }
  .ry { font-weight: 700; color: var(--ink); }
  .rv { display: inline-flex; align-items: center; gap: 4px; color: var(--ink); }
  .rv small { color: var(--ink-3); font-size: inherit; }
  .k { display: inline-block; width: 10px; height: 2px; background: var(--ink); }
  .k.avg { background: repeating-linear-gradient(90deg, var(--avg) 0 4px, transparent 4px 6px); height: 2px; }
  .k.hov { background: var(--petrol); }
  .chart { width: 100%; }
  svg { display: block; overflow: visible; cursor: crosshair; }
  svg:focus-visible { outline: 2px solid var(--petrol); outline-offset: 2px; }
  .grid { stroke: var(--rule-soft); stroke-width: 1; shape-rendering: crispEdges; }
  .marker { stroke: var(--ink-3); stroke-width: 1; stroke-dasharray: 2 3; shape-rendering: crispEdges; }
  .marker.ai { stroke: var(--warn); }
  .mlabel.ai { fill: var(--warn); font-weight: 600; }
  .mlabel { font-size: 10.5px; fill: var(--ink-2); paint-order: stroke; stroke: var(--paper); stroke-width: 3px; }
  path { fill: none; stroke-linejoin: round; stroke-linecap: round; }
  .other { stroke: var(--context); stroke-width: 1; stroke-opacity: 0.5; }
  .other.uni { stroke: var(--avg); stroke-width: 2.1; stroke-dasharray: 5 3; stroke-opacity: 1; }
  .band { fill: var(--ink); fill-opacity: 0.08; stroke: none; }
  .avg { stroke: var(--avg); stroke-width: 2.1; stroke-dasharray: 5 3; }
  .hover { stroke: var(--petrol); stroke-width: 2; }
  .own { stroke: var(--ink); stroke-width: 2.2; }
  .dotted { stroke-dasharray: 1.5 3; }
  .avg.dotted { stroke-dasharray: 1.5 3; }
  .own-dot { fill: var(--ink); }
  .cursor { stroke: var(--ink-3); stroke-width: 1; shape-rendering: crispEdges; }
  .large .abbr { font-size: var(--fs-lg); }
</style>
