<script lang="ts">
  import { scaleLinear } from 'd3';
  import type { Theses } from '../../lib/data/types';
  import { GRADE_VARS } from '../../lib/chart';
  import { L } from '../../lib/locale.svelte';
  import Plate from '../../lib/ui/Plate.svelte';

  /** Per-measure dot plot: each grade's median (marker) and middle half (whisker).
   *  Each row has its own zoomed axis, so read positions within a row only. */
  interface Props { theses: Theses; mask: Uint8Array; keys: string[] }
  let { theses, mask, keys }: Props = $props();

  const MIN_N = 20;
  const metricOf = (k: string) => theses.meta.metrics.find((m) => m.key === k)!;

  interface Stat { g: number; n: number; q1: number; med: number; q3: number }
  const rows = $derived.by(() => keys.map((k) => {
    const v = theses.metrics[k];
    const buckets: number[][] = [[], [], [], []];
    for (let i = 0; i < theses.n; i++) {
      if (!mask[i] || !theses.clean[i]) continue;
      const g = theses.grade[i];
      if (g < 1 || g > 4 || !Number.isFinite(v[i])) continue;
      buckets[g - 1].push(v[i]);
    }
    const stats: Stat[] = [];
    buckets.forEach((b, gi) => {
      if (b.length < MIN_N) return;
      const s = Float64Array.from(b).sort();
      const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
      stats.push({ g: gi + 1, n: s.length, q1: q(0.25), med: q(0.5), q3: q(0.75) });
    });
    return { k, m: metricOf(k), stats };
  }));

  /** The measure where the median excellent and failed thesis differ most (relative to the middle half). */
  const widest = $derived.by(() => {
    let best: { label: string; a: string; b: string; unit: string; r: number } | null = null;
    for (const row of rows) {
      const s1 = row.stats.find((s) => s.g === 1), s4 = row.stats.find((s) => s.g === 4);
      if (!s1 || !s4) continue;
      const iqr = Math.max(1e-9, (s1.q3 - s1.q1 + s4.q3 - s4.q1) / 2);
      const r = Math.abs(s1.med - s4.med) / iqr;
      if (!best || r > best.r) best = { label: L.pick(row.m.label), a: L.f.num(s1.med, row.m.decimals), b: L.f.num(s4.med, row.m.decimals), unit: L.pick(row.m.unit), r };
    }
    return best;
  });

  let width = $state(900);
  const narrow = $derived(width < 640);
  const labelW = $derived(narrow ? 0 : 230);
  const lane = 11;
  const rowH = $derived((narrow ? 22 : 6) + lane * 4 + 22);
  const x0 = $derived(labelW + 12), x1 = $derived(Math.max(x0 + 40, width - 12));
  const scaleFor = (st: Stat[]) => {
    const lo = Math.min(...st.map((s) => s.q1)), hi = Math.max(...st.map((s) => s.q3));
    const pad = (hi - lo) * 0.06 || 1;
    return scaleLinear().domain([lo - pad, hi + pad]).range([x0, x1]);
  };
  // Grade markers differ in shape as well as colour: circle, square, diamond, triangle.
  const SHAPES = [
    (r: number) => `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`,
    (r: number) => `M${-r * 0.88},${-r * 0.88}h${r * 1.76}v${r * 1.76}h${-r * 1.76}z`,
    (r: number) => `M0,${-r * 1.2}L${r * 1.2},0L0,${r * 1.2}L${-r * 1.2},0z`,
    (r: number) => `M0,${-r * 1.15}L${r * 1.15},${r * 0.85}L${-r * 1.15},${r * 0.85}z`,
  ];
</script>

<Plate id="g-dots" title={L.t['grades.dots.title']} unit={L.t['grades.dots.unit']} foot={L.t['grades.dots.foot']}>
  {#snippet table()}
    <table>
      <thead><tr><th>{L.t['grades.dots.measure']}</th>{#each [1, 2, 3, 4] as g (g)}<th>{g} {L.t[`grade.${g}` as 'grade.1']}</th>{/each}</tr></thead>
      <tbody>
        {#each rows as row (row.k)}
          <tr><td>{L.pick(row.m.label)} <span class="muted">({L.pick(row.m.unit)})</span></td>
            {#each [1, 2, 3, 4] as g (g)}
              {@const s = row.stats.find((x) => x.g === g)}
              <td>{s ? `${L.f.num(s.med, row.m.decimals)} (${L.f.num(s.q1, row.m.decimals)}–${L.f.num(s.q3, row.m.decimals)})` : '–'}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/snippet}

  {#if widest}<p class="lead-line">{L.t['grades.dots.widest'](widest.label, widest.a, widest.b, widest.unit)}</p>{/if}
  <ul class="key" aria-hidden="true">
    {#each [1, 2, 3, 4] as g (g)}
      <li><svg width="14" height="14"><path d={SHAPES[g - 1](4.5)} transform="translate(7,7)" fill={GRADE_VARS[g - 1]} stroke="var(--ink)" stroke-width="0.9"/></svg>{g} {L.t[`grade.${g}` as 'grade.1']}</li>
    {/each}
    <li><svg width="26" height="10"><line x1="1" x2="25" y1="5" y2="5" stroke="var(--ink-2)" stroke-width="1.5"/><path d="M1,2v6M25,2v6" stroke="var(--ink-2)" stroke-width="1.5"/></svg>{L.t['grades.dots.iqr']}</li>
  </ul>
  <div class="wrap" bind:clientWidth={width}>
    <svg {width} height={rowH * rows.length} role="img" aria-label={L.t['grades.dots.title']}>
      {#each rows as row, ri (row.k)}
        {@const sc = row.stats.length ? scaleFor(row.stats) : null}
        <g transform="translate(0,{ri * rowH})">
          {#if ri}<line class="sep" x1="0" x2={width} y1="0" y2="0" />{/if}
          {#if narrow}
            <text class="lab" x="0" y="16">{L.pick(row.m.label)} <tspan class="u">· {L.pick(row.m.unit)}</tspan></text>
          {:else}
            <text class="lab" x="0" y={6 + lane * 2 + 2}>{L.pick(row.m.label)}</text>
            <text class="u" x="0" y={6 + lane * 2 + 17}>{L.pick(row.m.unit)}</text>
          {/if}
          {#if sc}
            {@const top = narrow ? 22 : 6}
            {#each sc.ticks(4) as t (t)}
              <line class="grid" x1={sc(t)} x2={sc(t)} y1={top} y2={top + lane * 4} />
              <text class="tick" x={sc(t)} y={top + lane * 4 + 13} text-anchor="middle">{L.f.num(t, Math.max(0, row.m.decimals - 1))}</text>
            {/each}
            {#each row.stats as s (s.g)}
              {@const y = top + lane * (s.g - 0.5)}
              <line class="iqr" x1={sc(s.q1)} x2={sc(s.q3)} y1={y} y2={y} />
              <path class="cap" d="M{sc(s.q1)},{y - 3}v6M{sc(s.q3)},{y - 3}v6" />
              <path d={SHAPES[s.g - 1](4.2)} transform="translate({sc(s.med)},{y})" fill={GRADE_VARS[s.g - 1]} class="mk" />
            {/each}
          {/if}
        </g>
      {/each}
    </svg>
  </div>
</Plate>

<style>
  .wrap { width: 100%; }
  svg { display: block; overflow: visible; }
  .lead-line { margin: 0 0 var(--s3); font-size: var(--fs-md); color: var(--ink); max-width: 75ch; text-wrap: pretty; }
  .key { display: flex; flex-wrap: wrap; gap: 4px 16px; list-style: none; margin: 0 0 var(--s3); padding: 0; font-size: var(--fs-sm); color: var(--ink-2); }
  .key li { display: inline-flex; align-items: center; gap: 6px; }
  .sep { stroke: var(--rule-soft); }
  .lab { font-size: 13px; font-weight: 600; fill: var(--ink); }
  .u, .lab .u { font-size: 11.5px; font-weight: 400; fill: var(--ink-3); }
  .grid { stroke: var(--rule-soft); }
  .tick { font-size: 10.5px; fill: var(--ink-3); font-variant-numeric: tabular-nums; }
  .iqr { stroke: var(--ink-2); stroke-width: 1.5; }
  .cap { stroke: var(--ink-2); stroke-width: 1.5; fill: none; }
  .mk { stroke: var(--ink); stroke-width: 0.9; }
</style>
