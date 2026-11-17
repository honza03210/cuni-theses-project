<script lang="ts">
  import { area, scaleLinear, stack } from 'd3';
  import type { GradeYear } from '../../lib/data/aggregate';
  import { CHATGPT_X, GRADE_VARS, yearTicks } from '../../lib/chart';
  import { MIN_CELL_N } from '../../lib/data/select';
  import { L } from '../../lib/locale.svelte';
  import Tooltip from '../../lib/ui/Tooltip.svelte';
  import { YearDrag, resetZoom, zoomed } from '../../lib/state/zoom.svelte';

  /** `marked` = draw the selected-year rule (off while the bars compare before/after) */
  interface Props { rows: GradeYear[]; selected: number; yearMax: number; onselect: (y: number) => void; marked?: boolean; aiYear?: number | null; fill?: boolean }
  let { rows, selected, yearMax, onselect, marked = true, aiYear = null, fill = false }: Props = $props();

  let width = $state(600);
  // `fill`: grow to the height the layout offers (beside the taller faculty bars), never below 300px
  let boxH = $state(300);
  const height = $derived(fill ? Math.max(300, Math.min(420, boxH)) : 300);
  const m = { top: 10, right: 92, bottom: 24, left: 40 };
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const ih = $derived(height - m.top - m.bottom);
  const allValid = $derived(rows.filter((r) => r.total > 0));
  // the shared zoom narrows the visible years
  const span = $derived(zoomed(allValid[0]?.year ?? 2006, allValid[allValid.length - 1]?.year ?? 2025));
  const valid = $derived(allValid.filter((r) => r.year >= span[0] && r.year <= span[1]));
  const from = $derived(valid[0]?.year ?? 2006);
  const to = $derived(valid[valid.length - 1]?.year ?? 2025);
  const x = $derived(scaleLinear().domain([from, Math.max(to, from + 1)]).range([0, iw]));
  const y = $derived(scaleLinear().domain([0, 1]).range([ih, 0]));

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
    // labels pushed below the plot (e.g. 'good' and 'fail' both near 0 %): pull them back up from the bottom
    if (raw.length && raw[raw.length - 1].y > ih) {
      raw[raw.length - 1].y = ih;
      for (let i = raw.length - 2; i >= 0; i--) if (raw[i + 1].y - raw[i].y < 15) raw[i].y = raw[i + 1].y - 15;
    }
    return raw;
  });

  // Years resting on fewer than MIN_CELL_N theses: veiled, so a handful of theses never reads as a trend
  const thin = $derived(valid.filter((r) => r.total < MIN_CELL_N));
  // 95 % interval of the fail share per year (fails sit at the bottom of the stack): a small year's
  // spike shows up as a wide band instead of a confident hump
  const failCI = $derived.by(() => {
    const pts = valid.filter((r) => r.total >= MIN_CELL_N).map((r) => {
      const p = r.counts[3] / r.total, h = 1.96 * Math.sqrt(p * (1 - p) / r.total + 1e-9);
      return { year: r.year, lo: Math.max(0, p - h), hi: Math.min(1, p + h), wide: h > 0.03 };
    });
    if (pts.length < 2) return null;
    const top = pts.map((d) => `${x(d.year)},${y(d.hi)}`), bot = pts.map((d) => `${x(d.year)},${y(d.lo)}`).reverse();
    return { d: `M${top.join('L')}L${bot.join('L')}Z`, wide: pts.some((d) => d.wide) };
  });
  const slot = (yr: number) => {
    const a = x(Math.max(from, yr - 0.5)), b = x(Math.min(to, yr + 0.5));
    return { x: a, w: Math.max(2, b - a) };
  };

  let hover: { year: number; cx: number; cy: number } | null = $state(null);
  const hoverRow = $derived(hover ? rows.find((r) => r.year === hover!.year) : null);

  const drag = new YearDrag();
  function fracYear(e: PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    return Math.max(from, Math.min(to, x.invert(e.clientX - rect.left - m.left)));
  }
  const yearAt = (e: PointerEvent) => Math.round(fracYear(e));
  // a click picks a year, but only once it is clear it is not the first half of a double-click (unzoom)
  let clickT: ReturnType<typeof setTimeout> | undefined;
  function onClick(e: MouseEvent) {
    // the click that ends a zooming drag does not also pick a year
    if (drag.zoomedNow) { drag.zoomedNow = false; return; }
    if (e.detail > 1) return;
    const yr = yearAt(e as PointerEvent);
    clearTimeout(clickT);
    clickT = setTimeout(() => onselect(yr), 230);
  }
  function onDbl() { clearTimeout(clickT); resetZoom(); }
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

<div class="outer" class:fill>
<div class="wrap" bind:clientWidth={width} bind:clientHeight={boxH}>
  <svg {width} {height} role="slider" tabindex="0" aria-valuemin={from} aria-valuemax={to} aria-valuenow={selected}
    aria-label={L.t['grades.area.title']} aria-valuetext={String(selected)}
    onpointerdown={(e) => drag.begin(e, fracYear(e))} onpointerup={() => drag.end()} onpointercancel={() => drag.cancel()}
    onpointermove={(e) => { drag.move(fracYear(e)); hover = drag.active ? null : { year: yearAt(e), cx: e.clientX, cy: e.clientY }; }}
    onpointerleave={() => (hover = null)}
    onclick={onClick} ondblclick={onDbl}
    onkeydown={onKey}>
    <defs>
      <pattern id="hatch4" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" fill="var(--grade-4)" />
        <line x1="0" y1="0" x2="0" y2="5" stroke="rgb(255 255 255 / 0.55)" stroke-width="1.6" />
      </pattern>
      <pattern id="thinveil" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--paper)" opacity="0.85" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--paper)" stroke-width="2.4" />
      </pattern>
    </defs>
    <g transform="translate({m.left},{m.top})">
      {#each layers as layer (layer.key)}
        <!-- the common grades (1, 2) are drawn softer so the eye goes to 3 and 4, where change would show -->
        <path d={gen(layer as never)} fill={layer.key === 3 ? 'url(#hatch4)' : GRADE_VARS[layer.key]} fill-opacity={layer.key === 0 ? 0.55 : layer.key === 1 ? 0.7 : 1} stroke="var(--paper)" stroke-width="0.6" />
      {/each}
      {#each [0, 0.25, 0.5, 0.75, 1] as t (t)}
        <line class="grid" x1="0" x2={iw} y1={y(t)} y2={y(t)} />
        <text x="-6" y={y(t)} dy="0.32em" text-anchor="end">{L.f.pct(t, 0)}</text>
      {/each}
      {#each ticks as t (t)}
        {#if !marked || selected < from || selected > to || Math.abs(x(t) - x(selected)) > 42}<text x={x(t)} y={ih + 16} text-anchor="middle">{t}</text>{/if}
      {/each}
      {#if failCI}<path class="ci" d={failCI.d} />{/if}
      {#each thin as r (r.year)}
        <rect class="thin" x={slot(r.year).x} width={slot(r.year).w} y="0" height={ih} fill="url(#thinveil)" />
      {/each}
      {#if to >= yearMax}
        <rect x={x(yearMax - 1)} width={x(yearMax) - x(yearMax - 1)} y="0" height={ih} fill="var(--paper)" opacity="0.35" />
      {/if}
      {#if CHATGPT_X >= from && CHATGPT_X <= to}
        <line class="marker" x1={x(CHATGPT_X)} x2={x(CHATGPT_X)} y1="-4" y2={ih} />
        <!-- one marker for ChatGPT and, in AI mode, the filter's start a few pixels later -->
        <text class="mlabel" class:ai={aiYear !== null && aiYear >= from} x={x(CHATGPT_X) - 5} y="12" text-anchor="end">{aiYear !== null && aiYear >= from ? L.t['common.chatgptAi'] : L.t['common.chatgpt']}</text>
      {/if}
      {#if drag.active}<rect class="zsel" x={x(drag.lo)} width={Math.max(0, x(drag.hi) - x(drag.lo))} y="0" height={ih} />{/if}
      {#if marked && selected >= from && selected <= to}
        <line class="sel" x1={x(selected)} x2={x(selected)} y1="-6" y2={ih + 4} />
        <text class="sel-label" x={x(selected)} y={ih + 16} text-anchor="middle">{selected}</text>
      {/if}
      {#each labelYs as l (l.k)}
        <text class="blabel" x={iw + 8} y={l.y} dy="0.32em">{l.k + 1} · {L.t[`grade.${l.k + 1}` as 'grade.1']}</text>
      {/each}
    </g>
  </svg>
</div>
  {#if failCI?.wide}<p class="thin-note"><svg width="16" height="10" aria-hidden="true"><rect y="2" width="16" height="6" class="ci" /></svg>{L.t['grades.area.ci']}</p>{/if}
  {#if thin.length}<p class="thin-note"><svg width="16" height="10" aria-hidden="true"><rect width="16" height="10" fill="var(--grade-1)"/><rect width="16" height="10" fill="url(#thinveil)"/></svg>{L.t['grades.area.thin'](thin.map((r) => r.year).join(', '))}</p>{/if}
  {#if hover && hoverRow}
    <Tooltip x={hover.cx} y={hover.cy}>
      <div class="tt-title">{hoverRow.year}</div>
      {#if hoverRow.total >= MIN_CELL_N}
        {#each [0, 1, 2, 3] as g (g)}
          <div class="tt-row"><span><span class="swatch" style:background={GRADE_VARS[g]}></span>{g + 1} {L.t[`grade.${g + 1}` as 'grade.1']}</span><b>{L.f.pct(hoverRow.counts[g] / hoverRow.total)}</b></div>
        {/each}
      {/if}
      <div class="tt-row"><span>{L.t['common.n']}</span><b>{hoverRow.total < MIN_CELL_N ? `<${MIN_CELL_N}` : L.f.int(hoverRow.total)}</b></div>
      {#if hoverRow.total < MIN_CELL_N}<div class="tt-row"><span>{L.t['common.smallSample']}</span></div>{/if}
    </Tooltip>
  {/if}
</div>

<style>
  .wrap { width: 100%; }
  .outer.fill { flex: 1 1 auto; display: flex; flex-direction: column; }
  .outer.fill .wrap { position: relative; flex: 1 1 auto; min-height: 300px; }
  .outer.fill .wrap > svg { position: absolute; inset: 0 auto auto 0; }
  svg { display: block; overflow: visible; cursor: pointer; }
  svg:focus-visible { outline: 2px solid var(--petrol); outline-offset: 4px; }
  .grid { stroke: var(--paper); stroke-opacity: 0.6; stroke-width: 1; shape-rendering: crispEdges; }
  .marker { stroke: var(--ink); stroke-width: 1; stroke-dasharray: 2 3; }
  /* plain ink on the softened area fill: no sticker halo */
  .mlabel { font-size: 12px; fill: var(--ink); font-weight: 600; }
  .sel { stroke: var(--petrol); stroke-width: 2.5; }
  .sel-label { fill: var(--paper); font-weight: 700; paint-order: stroke; stroke: var(--petrol); stroke-width: 14px; stroke-linejoin: round; }
  .blabel { font-size: 12px; fill: var(--ink-2); }
  .mlabel.ai { fill: var(--warn); }
  .thin-note { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; font-size: var(--fs-xs); color: var(--ink-2); }
  .thin-note svg { flex: none; }
  .ci { fill: var(--ink); fill-opacity: 0.16; stroke: var(--ink); stroke-width: 0.8; stroke-dasharray: 2 2; }
</style>
