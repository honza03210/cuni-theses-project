<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3';
  import type { GradeFac } from '../../lib/data/aggregate';
  import type { Faculty } from '../../lib/data/types';
  import { MIN_CELL_N } from '../../lib/data/select';
  import { GRADE_VARS } from '../../lib/chart';
  import { L } from '../../lib/locale.svelte';
  import Tooltip from '../../lib/ui/Tooltip.svelte';

  interface Props { rows: GradeFac[]; all: GradeFac; faculties: Faculty[] }
  let { rows, all, faculties }: Props = $props();

  // Horizontal 100 % bars: one row per faculty, so every label stays readable.
  let width = $state(420);
  const sorted = $derived([...rows].filter((r) => r.total > 0)
    .sort((a, b) => b.counts[0] / b.total - a.counts[0] / a.total));
  const bars = $derived(all.total > 0 ? [all, ...sorted] : sorted);
  const rowH = 18;
  const m = { top: 4, right: 52, bottom: 22, left: 52 };
  const ih = $derived(bars.length * rowH + 8);
  const height = $derived(ih + m.top + m.bottom);
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const y = $derived(scaleBand<number>().domain(bars.map((b) => b.fac)).range([0, ih]).paddingInner(0.22).paddingOuter(0.05));
  const x = $derived(scaleLinear().domain([0, 1]).range([0, iw]));
  const label = (f: number) => (f < 0 ? L.t['filters.all'] : faculties[f].abbr);

  function segs(r: GradeFac) {
    let acc = 0;
    return [0, 1, 2, 3].map((g) => { const s = r.counts[g] / r.total; const seg = { g, x0: acc, x1: acc + s }; acc += s; return seg; });
  }

  let hover: { r: GradeFac; cx: number; cy: number } | null = $state(null);
  const missing = $derived(rows.filter((r) => r.total === 0).map((r) => faculties[r.fac].abbr));
</script>

<div class="wrap" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label={bars.map((b) => `${label(b.fac)}: ${L.f.pct(b.counts[0] / b.total)} 1`).join(', ')}>
    <defs>
      <pattern id="hatch4b" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" fill="var(--grade-4)" />
        <line x1="0" y1="0" x2="0" y2="5" stroke="rgb(255 255 255 / 0.55)" stroke-width="1.6" />
      </pattern>
    </defs>
    <g transform="translate({m.left},{m.top})">
      {#each [0, 0.25, 0.5, 0.75, 1] as t (t)}
        <text x={x(t)} y={ih + 15} text-anchor="middle">{t * 100} %</text>
      {/each}
      {#each bars as b (b.fac)}
        {@const small = b.total < MIN_CELL_N}
        <g class="bar" class:small class:all={b.fac < 0} transform="translate(0,{y(b.fac)})"
          onpointermove={(e) => (hover = { r: b, cx: e.clientX, cy: e.clientY })}
          onpointerleave={() => (hover = null)} role="presentation">
          <text class="yl" x="-8" y={y.bandwidth() / 2} dy="0.32em" text-anchor="end">{label(b.fac)}</text>
          {#each segs(b) as s (s.g)}
            <rect x={x(s.x0)} width={Math.max(0, x(s.x1) - x(s.x0))} height={y.bandwidth()}
              fill={s.g === 3 ? 'url(#hatch4b)' : GRADE_VARS[s.g]} />
          {/each}
          <text class="yn" x={iw + 6} y={y.bandwidth() / 2} dy="0.32em">{L.f.int(b.total)}</text>
        </g>
      {/each}
      {#if bars.length > 1}
        <line class="sep" x1="-48" x2={iw + 48} y1={(y(bars[1].fac) ?? 0) - (y.step() - y.bandwidth()) / 2} y2={(y(bars[1].fac) ?? 0) - (y.step() - y.bandwidth()) / 2} />
      {/if}
    </g>
  </svg>
  {#if missing.length}<p class="note">{missing.join(', ')}: 0 {L.t['common.theses']}</p>{/if}
  {#if hover}
    <Tooltip x={hover.cx} y={hover.cy}>
      <div class="tt-title">{hover.r.fac < 0 ? L.t['common.all'] : L.pick(faculties[hover.r.fac].name)}</div>
      {#each [0, 1, 2, 3] as g (g)}
        <div class="tt-row"><span><span class="swatch" style:background={GRADE_VARS[g]}></span>{g + 1} {L.t[`grade.${g + 1}` as 'grade.1']}</span><b>{L.f.pct(hover.r.counts[g] / hover.r.total)}</b></div>
      {/each}
      <div class="tt-row"><span>{L.t['common.n']}</span><b>{L.f.int(hover.r.total)}</b></div>
      {#if hover.r.total < MIN_CELL_N}<div class="tt-row"><span>{L.t['common.smallSample']}</span></div>{/if}
    </Tooltip>
  {/if}
</div>

<style>
  .wrap { width: 100%; }
  svg { display: block; overflow: visible; }
  .bar rect { stroke: var(--paper); stroke-width: 0.6; }
  .bar.small { opacity: 0.4; }
  .bar:hover rect { stroke: var(--ink); stroke-width: 1; }
  .yl { font-size: 12px; fill: var(--ink); font-weight: 600; }
  .bar.all .yl { font-weight: 700; }
  .yn { font-size: 11px; fill: var(--ink-3); }
  .sep { stroke: var(--rule); stroke-dasharray: 2 2; }
  .note { margin: 4px 0 0; font-size: var(--fs-xs); color: var(--ink-3); }
</style>
