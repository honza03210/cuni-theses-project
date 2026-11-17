<script lang="ts">
  import { area, scaleLinear, stack } from 'd3';
  import type { GradeYear } from '../../lib/data/aggregate';
  import { CHATGPT_X, GRADE_VARS, yearTicks } from '../../lib/chart';
  import { L } from '../../lib/locale.svelte';
  import Tooltip from '../../lib/ui/Tooltip.svelte';

  /** `marked` = draw the selected-year rule (off while the bars compare before/after) */
  interface Props { rows: GradeYear[]; selected: number; yearMax: number; onselect: (y: number) => void; marked?: boolean }
  let { rows, selected, yearMax, onselect, marked = true }: Props = $props();

  let width = $state(600);
  const height = 300;
  const m = { top: 10, right: 92, bottom: 24, left: 40 };
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const ih = height - m.top - m.bottom;
  const valid = $derived(rows.filter((r) => r.total > 0));
  const from = $derived(valid[0]?.year ?? 2006);
  const to = $derived(valid[valid.length - 1]?.year ?? 2025);
  const x = $derived(scaleLinear().domain([from, Math.max(to, from + 1)]).range([0, iw]));
  const y = scaleLinear().domain([0, 1]).range([ih, 0]);

  type Row = { year: number; s: number[] };
  const shares = $derived(valid.map((r): Row => ({ year: r.year, s: r.counts.map((c) => c / r.total) })));
  // stack bottom->top: 4, 3, 2, 1 so "excellent" sits on top as in the sketch
  const order = [3, 2, 1, 0];
  const layers = $derived(stack<Row, number>().keys(order).value((d, k) => d.s[k])(shares));
  const gen = $derived(area<[number, number] & { data: Row }>().x((d) => x(d.data.year)).y0((d) => y(d[0])).y1((d) => y(d[1])));
  const last = $derived(shares[shares.length - 1]);
  const labelYs = $derived.by(() => {
    if (!last) return [];
    // place labels at the right edge, centred on each band, then de-overlap
    let acc = 0;
    const raw = order.map((k) => { const mid = acc + last.s[k] / 2; acc += last.s[k]; return { k, y: y(mid) }; });
    raw.sort((a, b) => a.y - b.y);
    for (let i = 1; i < raw.length; i++) if (raw[i].y - raw[i - 1].y < 15) raw[i].y = raw[i - 1].y + 15;
    return raw;
  });

  let hover: { year: number; cx: number; cy: number } | null = $state(null);
  const hoverRow = $derived(hover ? rows.find((r) => r.year === hover!.year) : null);

  function yearAt(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    return Math.max(from, Math.min(to, Math.round(x.invert(e.clientX - rect.left - m.left))));
  }
  function onKey(e: KeyboardEvent) {
    let n = selected;
    if (e.key === 'ArrowLeft') n = Math.max(from, selected - 1);
    else if (e.key === 'ArrowRight') n = Math.min(to, selected + 1);
    else if (e.key === 'Home') n = from;
    else if (e.key === 'End') n = to;
    else return;
    e.preventDefault();
    onselect(n);
  }
  const ticks = $derived(yearTicks(from, to, iw, 40));
</script>

<div class="wrap" bind:clientWidth={width}>
  <svg {width} {height} role="slider" tabindex="0" aria-valuemin={from} aria-valuemax={to} aria-valuenow={selected}
    aria-label={L.t['grades.area.title']} aria-valuetext={String(selected)}
    onpointermove={(e) => (hover = { year: yearAt(e), cx: e.clientX, cy: e.clientY })}
    onpointerleave={() => (hover = null)}
    onclick={(e) => onselect(yearAt(e as unknown as PointerEvent))}
    onkeydown={onKey}>
    <defs>
      <pattern id="hatch4" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" fill="var(--grade-4)" />
        <line x1="0" y1="0" x2="0" y2="5" stroke="rgb(255 255 255 / 0.55)" stroke-width="1.6" />
      </pattern>
    </defs>
    <g transform="translate({m.left},{m.top})">
      {#each layers as layer (layer.key)}
        <path d={gen(layer as never)} fill={layer.key === 3 ? 'url(#hatch4)' : GRADE_VARS[layer.key]} stroke="var(--paper)" stroke-width="0.6" />
      {/each}
      {#each [0, 0.25, 0.5, 0.75, 1] as t (t)}
        <line class="grid" x1="0" x2={iw} y1={y(t)} y2={y(t)} />
        <text x="-6" y={y(t)} dy="0.32em" text-anchor="end">{t * 100} %</text>
      {/each}
      {#each ticks as t (t)}
        {#if !marked || Math.abs(x(t) - x(selected)) > 42}<text x={x(t)} y={ih + 16} text-anchor="middle">{t}</text>{/if}
      {/each}
      {#if to >= yearMax}
        <rect x={x(yearMax - 1)} width={x(yearMax) - x(yearMax - 1)} y="0" height={ih} fill="var(--paper)" opacity="0.35" />
      {/if}
      {#if CHATGPT_X >= from && CHATGPT_X <= to}
        <line class="marker" x1={x(CHATGPT_X)} x2={x(CHATGPT_X)} y1="-4" y2={ih} />
        <text class="mlabel" x={x(CHATGPT_X) - 5} y="12" text-anchor="end">{L.t['common.chatgpt']}</text>
      {/if}
      {#if marked}
        <line class="sel" x1={x(selected)} x2={x(selected)} y1="-6" y2={ih + 4} />
        <text class="sel-label" x={x(selected)} y={ih + 16} text-anchor="middle">{selected}</text>
      {/if}
      {#each labelYs as l (l.k)}
        <text class="blabel" x={iw + 8} y={l.y} dy="0.32em">{l.k + 1} · {L.t[`grade.${l.k + 1}` as 'grade.1']}</text>
      {/each}
    </g>
  </svg>
  {#if hover && hoverRow}
    <Tooltip x={hover.cx} y={hover.cy}>
      <div class="tt-title">{hoverRow.year}</div>
      {#each [0, 1, 2, 3] as g (g)}
        <div class="tt-row"><span><span class="swatch" style:background={GRADE_VARS[g]}></span>{g + 1} {L.t[`grade.${g + 1}` as 'grade.1']}</span><b>{L.f.pct(hoverRow.counts[g] / hoverRow.total)}</b></div>
      {/each}
      <div class="tt-row"><span>{L.t['common.n']}</span><b>{L.f.int(hoverRow.total)}</b></div>
    </Tooltip>
  {/if}
</div>

<style>
  .wrap { width: 100%; }
  svg { display: block; overflow: visible; cursor: pointer; }
  svg:focus-visible { outline: 2px solid var(--petrol); outline-offset: 4px; }
  .grid { stroke: var(--paper); stroke-opacity: 0.6; stroke-width: 1; shape-rendering: crispEdges; }
  .marker { stroke: var(--ink); stroke-width: 1; stroke-dasharray: 2 3; }
  .mlabel { font-size: 11.5px; fill: #f6f4ee; font-weight: 700; paint-order: stroke; stroke: #163f4f; stroke-width: 3.5px; stroke-linejoin: round; }
  .sel { stroke: var(--petrol); stroke-width: 2.5; }
  .sel-label { fill: var(--paper); font-weight: 700; paint-order: stroke; stroke: var(--petrol); stroke-width: 14px; stroke-linejoin: round; }
  .blabel { font-size: 12px; fill: var(--ink-2); }
</style>
