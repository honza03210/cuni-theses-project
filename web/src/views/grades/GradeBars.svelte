<script lang="ts">
  import { scaleBand, scaleLinear } from 'd3';
  import type { GradeFac } from '../../lib/data/aggregate';
  import type { Faculty } from '../../lib/data/types';
  import { GRADE_VARS } from '../../lib/chart';
  import { L } from '../../lib/locale.svelte';
  import Tooltip from '../../lib/ui/Tooltip.svelte';
  import { MIN_CELL_N } from '../../lib/data/select';
  import { app } from '../../lib/state/app.svelte';
  import { FAC_SHORT } from '../../lib/faculties';

  /** Horizontal 100 % bars, one row per faculty. With `prev`, each row holds two bars:
   *  the earlier period (thin, upper) and the later one (full, lower), labelled by `tags`. */
  interface Props { rows: GradeFac[]; all: GradeFac; faculties: Faculty[]; prev?: GradeFac[] | null; prevAll?: GradeFac | null; tags?: [string, string] }
  let { rows, all, faculties, prev = null, prevAll = null, tags = ['', ''] }: Props = $props();

  let width = $state(420);
  // Faculties with fewer than SMALL theses are unreliable: outlined and listed after the others,
  // so a tiny faculty never tops what reads like a ranking.
  const SMALL = 50;
  const paired = $derived(!!prev);
  const prevOf = (f: number) => (f < 0 ? prevAll : prev?.find((r) => r.fac === f)) ?? null;
  const isSmall = (r: GradeFac) => r.total < SMALL || (paired && (prevOf(r.fac)?.total ?? 0) < SMALL);
  const byShare = (a: GradeFac, b: GradeFac) => b.counts[0] / b.total - a.counts[0] / a.total;
  // Fewer than MIN_CELL_N theses: never drawn (a handful of theses can point to one student); listed by name instead.
  const shown = $derived(rows.filter((r) => r.total >= MIN_CELL_N));
  const hidden = $derived(rows.filter((r) => r.total > 0 && r.total < MIN_CELL_N).map((r) => faculties[r.fac].abbr));
  const sorted = $derived([
    ...shown.filter((r) => !isSmall(r)).sort(byShare),
    ...shown.filter((r) => isSmall(r)).sort(byShare),
  ]);
  // Before/after: by default only the faculties whose "excellent" share changed most clearly, i.e. furthest
  // beyond chance (two-proportion z), so small samples do not win by noise; the rest on request
  const TOP = 6;
  let showAll = $state(false);
  const moved = (r: GradeFac) => {
    const p = prevShown(r.fac);
    if (!p) return -1;
    const a = p.counts[0] / p.total, b = r.counts[0] / r.total;
    return Math.abs(b - a) / Math.sqrt(a * (1 - a) / p.total + b * (1 - b) / r.total + 1e-9);
  };
  const trimmed = $derived(paired && !showAll && sorted.length > TOP + 1);
  const visible = $derived(trimmed ? sorted.filter((r) => [...sorted].sort((a, b) => moved(b) - moved(a)).slice(0, TOP).includes(r)) : sorted);
  // one faculty: the "All" row would only repeat it
  const bars = $derived(all.total >= MIN_CELL_N && rows.length > 1 ? [all, ...visible] : visible);
  const prevShown = (f: number) => { const p = prevOf(f); return p && p.total >= MIN_CELL_N ? p : null; };
  const rowH = $derived(paired ? 26 : 18);
  // simple version: the short names the filter uses (codes only in the detailed version)
  const m = $derived({ top: 4, right: paired ? 62 : 52, bottom: 22, left: app.detailed ? 52 : 132 });
  const ih = $derived(bars.length * rowH + 8);
  const height = $derived(ih + m.top + m.bottom);
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const y = $derived(scaleBand<number>().domain(bars.map((b) => b.fac)).range([0, ih]).paddingInner(paired ? 0.16 : 0.22).paddingOuter(0.05));
  const x = $derived(scaleLinear().domain([0, 1]).range([0, iw]));
  // A–F faculties are marked: a change there can also come from their grading scale
  const AF = ['etf', 'fsv'];
  // the † and its note belong to the detailed version
  const isAF = (f: number) => app.detailed && f >= 0 && AF.includes(faculties[f].code);
  const facName = (f: number) => (!app.detailed && FAC_SHORT[faculties[f].code] ? L.pick(FAC_SHORT[faculties[f].code]) : faculties[f].abbr);
  const label = (f: number) => (f < 0 ? L.t['filters.all'] : facName(f) + (isAF(f) ? '†' : ''));
  const anyAF = $derived(bars.some((b) => isAF(b.fac)));
  // paired rows: earlier bar 40 % of the band, later bar 60 %, 2px apart
  const parts = $derived.by(() => {
    const bw = y.bandwidth();
    return paired ? { prevY: 0, prevH: bw * 0.4 - 1, curY: bw * 0.4 + 1, curH: bw * 0.6 - 1 } : { prevY: 0, prevH: 0, curY: 0, curH: bw };
  });

  function segs(r: GradeFac) {
    let acc = 0;
    return [0, 1, 2, 3].map((g) => { const s = r.total ? r.counts[g] / r.total : 0; const seg = { g, x0: acc, x1: acc + s }; acc += s; return seg; });
  }

  let hover: { r: GradeFac; tag: string; cx: number; cy: number } | null = $state(null);
  const missing = $derived(rows.filter((r) => r.total === 0).map((r) => faculties[r.fac].abbr));
  const ariaText = $derived(bars.map((b) => {
    const p = prevShown(b.fac);
    return paired && p?.total
      ? `${label(b.fac)}: 1 ${L.f.pct(p.counts[0] / p.total)} → ${L.f.pct(b.counts[0] / b.total)}`
      : `${label(b.fac)}: 1 ${L.f.pct(b.counts[0] / b.total)}`;
  }).join(', '));
</script>

{#snippet bar(r: GradeFac, yy: number, h: number, tag: string)}
  <g class="seg-row" class:prev={paired && tag === tags[0]} role="presentation" onpointermove={(e) => (hover = { r, tag, cx: e.clientX, cy: e.clientY })} onpointerleave={() => (hover = null)}>
    {#each segs(r) as s (s.g)}
      <rect x={x(s.x0)} y={yy} width={Math.max(0, x(s.x1) - x(s.x0))} height={h}
        fill={s.g === 3 ? 'url(#hatch4b)' : GRADE_VARS[s.g]} stroke={GRADE_VARS[s.g]} />
    {/each}
  </g>
{/snippet}

<div class="wrap" bind:clientWidth={width}>
  {#if trimmed}<p class="cut">{app.detailed ? L.t['grades.bars.cut'](TOP) : L.t['grades.bars.cutShort'](TOP)}</p>{/if}
  {#if paired}
    <p class="pkey"><span class="pk prev"></span>{tags[0]}<span class="pk cur"></span>{tags[1]}</p>
  {/if}
  <svg {width} {height} role="img" aria-label={ariaText}>
    <defs>
      <pattern id="hatch4b" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" fill="var(--grade-4)" />
        <line x1="0" y1="0" x2="0" y2="5" stroke="rgb(255 255 255 / 0.55)" stroke-width="1.6" />
      </pattern>
    </defs>
    <g transform="translate({m.left},{m.top})">
      {#each [0, 0.25, 0.5, 0.75, 1] as t (t)}
        <text x={x(t)} y={ih + 15} text-anchor="middle">{L.f.pct(t, 0)}</text>
      {/each}
      {#each bars as b (b.fac)}
        {@const p = prevShown(b.fac)}
        <g class="bar" class:small={isSmall(b)} class:all={b.fac < 0} transform="translate(0,{y(b.fac)})">
          <text class="yl" x="-8" y={paired ? parts.curY + parts.curH / 2 - 3 : y.bandwidth() / 2} dy="0.32em" text-anchor="end">{label(b.fac)}</text>
          {#if paired && p && p.total}{@render bar(p, parts.prevY, parts.prevH, tags[0])}{/if}
          {@render bar(b, parts.curY, parts.curH, paired ? tags[1] : '')}
          {#if paired && b === bars[0]}
            <!-- the first pair names its periods directly; the rest follow the same order -->
            <text class="ytag" x={iw + 6} y={parts.prevY + parts.prevH / 2} dy="0.32em">{tags[0]}</text>
            <text class="ytag cur" x={iw + 6} y={parts.curY + parts.curH / 2} dy="0.32em">{tags[1]}</text>
          {:else}
            <text class="yn" x={iw + 6} y={paired ? parts.curY + parts.curH / 2 : y.bandwidth() / 2} dy="0.32em">{L.f.int(b.total)}</text>
          {/if}
        </g>
      {/each}
      {#if bars.length > 1}
        <line class="sep" x1="-48" x2={iw + 48} y1={(y(bars[1].fac) ?? 0) - (y.step() - y.bandwidth()) / 2} y2={(y(bars[1].fac) ?? 0) - (y.step() - y.bandwidth()) / 2} />
      {/if}
    </g>
  </svg>
  {#if paired && sorted.length > TOP + 1}
    <button type="button" class="more-btn" onclick={() => (showAll = !showAll)}>{showAll ? L.t['grades.bars.fewer'](TOP) : L.t['grades.bars.all'](sorted.length)}</button>
  {/if}
  <!-- the detailed version explains outlined bars in the plate foot -->
  {#if !app.detailed && bars.some((b) => isSmall(b))}<p class="note">{L.t['grades.bars.smallShort']}</p>{/if}
  {#if anyAF}<p class="note full-only">{L.t['grades.bars.af']}</p>{/if}
  {#if missing.length || hidden.length}<p class="note full-only">{L.t['grades.bars.notShown'](missing.join(', '), hidden.join(', '))}</p>{/if}
  {#if hover}
    <Tooltip x={hover.cx} y={hover.cy}>
      <div class="tt-title">{hover.r.fac < 0 ? L.t['common.all'] : app.detailed ? L.pick(faculties[hover.r.fac].name) : facName(hover.r.fac)}{#if hover.tag}{' '}<span class="tt-tag">{hover.tag}</span>{/if}</div>
      {#each [0, 1, 2, 3] as g (g)}
        <div class="tt-row"><span><span class="swatch" style:background={GRADE_VARS[g]}></span>{g + 1} {L.t[`grade.${g + 1}` as 'grade.1']}</span><b>{L.f.pct(hover.r.counts[g] / hover.r.total)}</b></div>
      {/each}
      <div class="tt-row"><span>{L.t['common.n']}</span><b>{L.f.int(hover.r.total)}</b></div>
      {#if hover.r.total < SMALL}<div class="tt-row"><span>{L.t['common.smallSample']}</span></div>{/if}
    </Tooltip>
  {/if}
</div>

<style>
  .wrap { width: 100%; }
  svg { display: block; overflow: visible; }
  .bar rect { stroke-width: 0; }
  /* small faculties: hollow bars (outline + faint fill) read as weaker in both themes; label stays readable */
  .bar.small rect { fill-opacity: 0.14; stroke-width: 1; stroke-opacity: 0.8; }
  .bar.small .yl { font-weight: 400; fill: var(--ink-3); }
  .seg-row:hover rect { stroke: var(--ink); stroke-width: 1; stroke-opacity: 1; }
  .yl { font-size: 12px; fill: var(--ink); font-weight: 600; }
  .bar.all .yl { font-weight: 700; }
  .yn { font-size: 11px; fill: var(--ink-3); }
  .ytag { font-size: 10px; fill: var(--ink-3); }
  .ytag.cur { fill: var(--ink); font-weight: 600; }
  /* the earlier period is the thinner, lighter bar */
  .bar:not(.small) .seg-row.prev rect { fill-opacity: 0.6; }
  .sep { stroke: var(--rule); stroke-dasharray: 2 2; }
  .note { margin: 4px 0 0; font-size: var(--fs-xs); color: var(--ink-3); text-wrap: pretty; }
  .cut { margin: 0 0 var(--s2); font-size: var(--fs-sm); color: var(--ink-2); text-wrap: pretty; }
  .pkey { display: flex; align-items: center; gap: 6px; margin: 0 0 var(--s2); font-size: var(--fs-sm); color: var(--ink-2); }
  /* the period is encoded by thickness, so the key is ink: grade colours stay for grades */
  .pk { display: inline-block; width: 18px; background: var(--ink-2); border-radius: 1px; }
  .pk.prev { height: 5px; opacity: 0.6; }
  .pk.cur { height: 9px; margin-left: 12px; }
  .more-btn { margin: 6px 0 0; border: 0; background: none; padding: 4px 0; cursor: pointer; font-size: var(--fs-sm); font-weight: 600; color: var(--ink-2); text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 3px; }
  @media (pointer: coarse), (max-width: 639px) { .more-btn { min-height: 44px; } }
  .more-btn:hover { color: var(--ink); text-decoration-color: var(--ink); }
  :global(.tt-tag) { font-weight: 400; color: var(--ink-2); }
</style>
