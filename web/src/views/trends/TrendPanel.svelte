<script lang="ts">
  import { precisionFixed, scaleLinear } from 'd3';
  import type { MetricSeries, Point } from '../../lib/data/aggregate';
  import type { Faculty, MetricMeta } from '../../lib/data/types';
  import { CHATGPT_X, bandPath, seriesPaths, yearTicks } from '../../lib/chart';
  import { ui } from '../../lib/state/app.svelte';
  import { L } from '../../lib/locale.svelte';
  import { app } from '../../lib/state/app.svelte';
  import { FAC_SHORT } from '../../lib/faculties';
  import { YearDrag, resetZoom, zoomed } from '../../lib/state/zoom.svelte';

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
    /** roving tabindex: only one panel of the grid is a Tab stop; Up/Down (and Home/End) move between panels */
    tabStop?: boolean;
    onnav?: (key: string) => void;
  }
  let { fac, faculty, faculties, series, facs, yDomain, metric, yearFrom, yearTo, yearMax, aiYear, aiOn, uniRef, large, first = false, showOthers = true, tabStop = true, onnav }: Props = $props();

  let width = $state(260);
  const height = $derived(large ? 380 : 168);
  const m = { top: 8, right: 10, bottom: 22, left: 38 };
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const ih = $derived(height - m.top - m.bottom);
  // the shared zoom narrows the visible years; data outside them is not drawn
  const span = $derived(zoomed(yearFrom, yearTo));
  const zf = $derived(span[0]);
  const zt = $derived(span[1]);
  const x = $derived(scaleLinear().domain([zf - 0.25, Math.max(zt, zf + 1) + 0.25]).range([0, iw]));
  const y = $derived(scaleLinear().domain(yDomain).range([ih, 0]).nice(4));
  const yTicks = $derived(y.ticks(large ? 6 : 4));
  const tickDec = $derived(yTicks.length > 1 ? precisionFixed(yTicks[1] - yTicks[0]) : metric.decimals);
  const xTicks = $derived(yearTicks(zf, zt, iw, large ? 44 : 40));

  const inZ = (p: { year: number }) => p.year >= zf && p.year <= zt;
  const toV = (pts: Point[]) => pts.filter(inZ).map((p) => ({ year: p.year, v: p.mean }));
  const own = $derived(series.byFac.get(fac) ?? []);
  const ownPaths = $derived(seriesPaths(toV(own), x, y, yearMax));
  const avgPaths = $derived(seriesPaths(toV(series.overall), x, y, yearMax));
  const uniPaths = $derived(uniRef ? seriesPaths(toV(uniRef), x, y, yearMax) : null);
  const others = $derived(facs.filter((f) => f !== fac).map((f) => ({ f, p: seriesPaths(toV(series.byFac.get(f) ?? []), x, y, yearMax) })));
  const band = $derived(bandPath(own.filter(inZ), x, y));

  const hoverOther = $derived(ui.hoverFac !== null && ui.hoverFac !== fac && facs.includes(ui.hoverFac) ? ui.hoverFac : null);
  const hoverPaths = $derived(hoverOther !== null ? others.find((o) => o.f === hoverOther)?.p ?? null : null);

  // readout: hovered or keyboard-focused year
  let readYear: number | null = $state(null);
  const readOwn = $derived(readYear !== null ? own.find((p) => p.year === readYear) : undefined);
  const readAvg = $derived(readYear !== null ? series.overall.find((p) => p.year === readYear) : undefined);
  const readHover = $derived(readYear !== null && hoverOther !== null ? series.byFac.get(hoverOther)?.find((p) => p.year === readYear) : undefined);
  // the highlighted faculty is named at the end of its own line, in every panel
  const hoverEnd = $derived.by(() => {
    if (hoverOther === null) return null;
    const pts = (series.byFac.get(hoverOther) ?? []).filter(inZ);
    return pts.length ? pts[pts.length - 1] : null;
  });
  // a zoom can leave the keyboard readout on a year that is no longer drawn
  $effect(() => { if (readYear !== null && (readYear < zf || readYear > zt)) readYear = null; });
  const fmtV = (v: number) => L.f.num(v, metric.decimals);

  const drag = new YearDrag();
  const fracYear = (e: PointerEvent) => {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    return Math.max(zf, Math.min(zt, x.invert(e.clientX - rect.left - m.left)));
  };
  function onMove(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const py = e.clientY - rect.top - m.top;
    const fy = fracYear(e);
    drag.move(fy);
    readYear = Math.round(fy);
    // nearest other faculty line at this year -> shared hover across panels
    let best: number | null = null, bestD = 14;
    for (const f of facs) {
      if (f === fac) continue;
      const p = series.byFac.get(f)?.find((q) => q.year === readYear);
      if (!p) continue;
      const d = Math.abs(y(p.mean) - py);
      if (d < bestD) { bestD = d; best = f; }
    }
    // the simple version draws no other faculties, so it highlights none either
    ui.hoverFac = app.detailed ? best : null;
  }
  function onLeave() { readYear = null; ui.hoverFac = null; }
  function onKey(e: KeyboardEvent) {
    const cur = readYear ?? zt;
    if (e.key === 'ArrowLeft') readYear = Math.max(zf, cur - 1);
    else if (e.key === 'ArrowRight') readYear = Math.min(zt, cur + 1);
    else if (e.key === 'Escape') readYear = null;
    else if (onnav && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) onnav(e.key);
    else return;
    e.preventDefault();
  }
  const short = $derived(FAC_SHORT[faculty.code] ? L.pick(FAC_SHORT[faculty.code]) : faculty.abbr);
  const label = $derived(`${short} (${faculty.abbr}), ${L.pick(metric.label)}`);
</script>

<figure class="panel" class:large>
  <figcaption>
    {#if !app.detailed && FAC_SHORT[faculty.code]}
      <!-- simple version: a short name the public can read, the abbreviation after it -->
      <span class="abbr" title={L.pick(faculty.name)}>{L.pick(FAC_SHORT[faculty.code])}<span class="ab2">{' · '}{faculty.abbr}</span></span>
    {:else}
      <span class="abbr" title={L.pick(faculty.name)}>{faculty.abbr}</span>
    {/if}
    <span class="readout" aria-live="polite">
      {#if readYear !== null}
        <span class="ry">{readYear}</span>
        <span class="rv"><i class="k own"></i>{readOwn ? fmtV(readOwn.mean) : '–'}{#if readOwn}<small> n={L.f.int(readOwn.n)}</small>{/if}</span>
        <span class="rv"><i class="k avg"></i>{readAvg ? fmtV(readAvg.mean) : '–'}</span>
        {#if readHover && hoverOther !== null}<span class="rv"><i class="k hov"></i>{faculties[hoverOther].abbr} {fmtV(readHover.mean)}</span>{/if}
      {:else}
        <span class="name full-only">{L.pick(faculty.name)}</span>
      {/if}
    </span>
  </figcaption>
  <div class="chart" bind:clientWidth={width}>
    <svg {width} {height} role="slider" aria-label={label} tabindex={tabStop ? 0 : -1}
      aria-valuemin={yearFrom} aria-valuemax={yearTo} aria-valuenow={readYear ?? yearTo}
      aria-valuetext={readYear !== null && readOwn ? `${readYear}: ${fmtV(readOwn.mean)}` : faculty.abbr}
      onpointerdown={(e) => drag.begin(e, fracYear(e))} onpointerup={() => drag.end()} onpointercancel={() => drag.cancel()}
      ondblclick={resetZoom}
      onpointermove={onMove} onpointerleave={onLeave} onkeydown={onKey} onblur={() => (readYear = null)}>
      <g transform="translate({m.left},{m.top})">
        {#each yTicks as t (t)}
          <line class="grid" x1="0" x2={iw} y1={y(t)} y2={y(t)} />
          <text x="-6" y={y(t)} dy="0.32em" text-anchor="end">{L.f.num(t, tickDec)}</text>
        {/each}
        {#each xTicks as t (t)}
          <text x={x(t)} y={ih + 15} text-anchor="middle">{large ? t : `'${String(t).slice(2)}`}</text>
        {/each}

        {#if CHATGPT_X >= zf && CHATGPT_X <= zt + 0.25}
          <line class="marker" x1={x(CHATGPT_X)} x2={x(CHATGPT_X)} y1="0" y2={ih} />
          <!-- one marker: ChatGPT (Nov 2022) and the AI filter's start (2023) are a few pixels apart -->
          {#if large || first}<text class="mlabel" class:ai={aiOn && aiYear >= yearFrom} x={x(CHATGPT_X) - 3} y="9" text-anchor="end">{aiOn && aiYear >= yearFrom ? L.t['common.chatgptAi'] : L.t['common.chatgpt']}</text>{/if}
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
          {#if hoverEnd && hoverOther !== null}<text class="hlabel" x={x(hoverEnd.year) - 2} y={y(hoverEnd.mean) - 6} text-anchor="end">{faculties[hoverOther].abbr}</text>{/if}
        {/if}
        <path class="own" d={ownPaths.solid} />
        <path class="own dotted" d={ownPaths.dotted} />
        {#each ownPaths.singles as s (s.year)}<circle class="own-dot" cx={x(s.year)} cy={y(s.v)} r="2.5" />{/each}

        {#if drag.active}<rect class="zsel" x={x(drag.lo)} width={Math.max(0, x(drag.hi) - x(drag.lo))} y="0" height={ih} />{/if}
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
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--rule);
    min-height: 26px;
    overflow: hidden;
  }
  .abbr { font-weight: 700; font-size: var(--fs-md); flex: none; }
  .ab2 { font-weight: 400; color: var(--ink-3); }
  .readout { display: flex; flex-wrap: wrap; gap: 0 10px; align-items: baseline; font-size: var(--fs-xs); color: var(--ink-2); min-width: 0; white-space: nowrap; }
  .name { overflow: hidden; text-overflow: ellipsis; color: var(--ink-3); }
  .ry { font-weight: 700; color: var(--ink); }
  .rv { display: inline-flex; align-items: center; gap: 4px; color: var(--ink); }
  .rv small { color: var(--ink-3); font-size: inherit; }
  .k { display: inline-block; width: 10px; height: 2px; background: var(--ink); }
  .k.avg { background: repeating-linear-gradient(90deg, var(--avg) 0 4px, transparent 4px 6px); height: 2px; }
  .k.hov { background: var(--ink-2); }
  .chart { width: 100%; }
  svg { display: block; overflow: visible; cursor: crosshair; }
  svg:focus-visible { outline: 2px solid var(--petrol); outline-offset: 2px; }
  .grid { stroke: var(--rule-soft); stroke-width: 1; shape-rendering: crispEdges; }
  .marker { stroke: var(--ink-3); stroke-width: 1; stroke-dasharray: 2 3; shape-rendering: crispEdges; }
  .mlabel.ai { fill: var(--warn); font-weight: 600; }
  .mlabel { font-size: 11px; fill: var(--ink-2); paint-order: stroke; stroke: var(--paper); stroke-width: 3px; }
  path { fill: none; stroke-linejoin: round; stroke-linecap: round; }
  .other { stroke: var(--context); stroke-width: 1; stroke-opacity: 0.5; }
  .other.uni { stroke: var(--avg); stroke-width: 2.1; stroke-dasharray: 5 3; stroke-opacity: 1; }
  .band { fill: var(--ink); fill-opacity: 0.08; stroke: none; }
  .avg { stroke: var(--avg); stroke-width: 2.1; stroke-dasharray: 5 3; }
  /* ink, not petrol: petrol means selected, and a hovered peer is only a reference */
  .hover { stroke: var(--ink-2); stroke-width: 1.8; }
  .hlabel { font-size: 11px; font-weight: 600; fill: var(--ink-2); paint-order: stroke; stroke: var(--paper); stroke-width: 3px; stroke-linejoin: round; }
  .own { stroke: var(--ink); stroke-width: 2.2; }
  .dotted { stroke-dasharray: 1.5 3; }
  .avg.dotted { stroke-dasharray: 1.5 3; }
  .own-dot { fill: var(--ink); }
  .cursor { stroke: var(--ink-3); stroke-width: 1; shape-rendering: crispEdges; }
  .large .abbr { font-size: var(--fs-lg); }
</style>
