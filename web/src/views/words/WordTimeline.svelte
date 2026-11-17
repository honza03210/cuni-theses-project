<script lang="ts">
  import { BASE_MAX, BASE_MIN, clampComparison, type Comparison } from '../../lib/data/excess';
  import { CHATGPT_X } from '../../lib/chart';
  import { L } from '../../lib/locale.svelte';

  interface Props {
    yearMin: number;
    yearMax: number;
    totals: number[];          // theses per year (index = year - yearMin)
    cmp: Comparison;
    onchange: (c: Comparison) => void;
  }
  let { yearMin, yearMax, totals, cmp, onchange }: Props = $props();

  let width = $state(800);
  const height = 92;
  const m = { top: 22, right: 8, bottom: 18, left: 8 };
  const ih = height - m.top - m.bottom;
  const n = $derived(yearMax - yearMin + 1);
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const step = $derived(iw / n);
  /** left edge of a year's slot */
  const xl = (y: number) => (y - yearMin) * step;
  const maxTotal = $derived(Math.max(1, ...totals));
  const bh = (v: number) => (v / maxTotal) * (ih - 6);
  const labelEvery = $derived(step >= 34 ? 1 : step >= 17 ? 2 : 5);

  const baseFrom = $derived(cmp.from - cmp.base);
  const set = (c: Comparison) => onchange(clampComparison(c, yearMin, yearMax));

  // ---- pointer interaction: select a block, move it, or drag the baseline's left edge
  type Mode = { kind: 'select'; anchor: number } | { kind: 'move'; grab: number; len: number } | { kind: 'base' } | null;
  let mode = $state<Mode>(null);
  let hover: 'base' | 'block' | null = $state(null);

  function local(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    return { px: e.clientX - r.left - m.left, py: e.clientY - r.top };
  }
  const yearAt = (px: number) => Math.max(yearMin, Math.min(yearMax, yearMin + Math.floor(px / step)));
  // touch needs a wider grab zone around the trend band's left edge
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const nearBaseEdge = (px: number) => Math.abs(px - xl(baseFrom)) < Math.max(coarse ? 16 : 8, step * 0.35);
  const inBlock = (px: number) => px >= xl(cmp.from) && px <= xl(cmp.to + 1);

  function down(e: PointerEvent) {
    const { px } = local(e);
    e.preventDefault(); // no focus ring from mouse use; keyboard focus still shows it
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    if (nearBaseEdge(px)) mode = { kind: 'base' };
    else if (inBlock(px) && cmp.to > cmp.from) mode = { kind: 'move', grab: yearAt(px) - cmp.from, len: cmp.to - cmp.from };
    else {
      const y = yearAt(px);
      mode = { kind: 'select', anchor: y };
      set({ ...cmp, from: y, to: y });
    }
  }
  function move(e: PointerEvent) {
    const { px } = local(e);
    if (!mode) { hover = nearBaseEdge(px) ? 'base' : inBlock(px) && cmp.to > cmp.from ? 'block' : null; return; }
    if (mode.kind === 'base') {
      const edge = yearMin + Math.round(px / step);
      set({ ...cmp, base: cmp.from - edge });
    } else if (mode.kind === 'select') {
      const y = yearAt(px);
      set({ ...cmp, from: Math.min(mode.anchor, y), to: Math.max(mode.anchor, y) });
    } else {
      const from = yearAt(px) - mode.grab;
      const f = Math.max(yearMin + BASE_MIN, Math.min(yearMax - mode.len, from));
      set({ ...cmp, from: f, to: f + mode.len });
    }
  }
  function up() { mode = null; }

  function key(e: KeyboardEvent) {
    const len = cmp.to - cmp.from;
    let next: Comparison | null = null;
    if (e.key === 'ArrowLeft' && e.shiftKey) next = { ...cmp, to: Math.max(cmp.from, cmp.to - 1) };
    else if (e.key === 'ArrowRight' && e.shiftKey) next = { ...cmp, to: cmp.to + 1 };
    else if (e.key === 'ArrowLeft') next = { ...cmp, from: cmp.from - 1, to: cmp.from - 1 + len };
    else if (e.key === 'ArrowRight') next = cmp.to < yearMax ? { ...cmp, from: cmp.from + 1, to: cmp.to + 1 } : null;
    else if (e.key === '[') next = { ...cmp, base: cmp.base + 1 };
    else if (e.key === ']') next = { ...cmp, base: cmp.base - 1 };
    if (!next) return;
    e.preventDefault();
    if (next.from - next.base < yearMin && e.key === 'ArrowLeft' && !e.shiftKey) return;
    set(next);
  }

  const blockLabel = $derived(cmp.from === cmp.to ? `${cmp.from}` : `${cmp.from}–${cmp.to}`);
  const baseLabelFull = $derived(`${L.t['words.detail.fit']} ${baseFrom}–${cmp.from - 1}`);
  // Place the two labels above the bands without overlapping (estimated text widths;
  // on narrow screens the trend label drops its word and keeps the years).
  const labels = $derived.by(() => {
    const tw = blockLabel.length * 7.2, cx = (xl(cmp.from) + xl(cmp.to + 1)) / 2;
    const tx = Math.min(iw - tw / 2, Math.max(tw / 2, cx));
    const tLeft = tx - tw / 2 - 8;
    for (const text of [baseLabelFull, `${baseFrom}–${cmp.from - 1}`]) {
      const bw = text.length * 6.2;
      const bx = Math.min((xl(baseFrom) + xl(cmp.from)) / 2, tLeft - bw / 2);
      if (bx - bw / 2 >= -m.left) return { tx, bx, base: text };
    }
    return { tx, bx: -1, base: '' };
  });
  const baseLabel = $derived(baseLabelFull);
  const cursor = $derived(mode?.kind === 'base' || hover === 'base' ? 'ew-resize' : hover === 'block' || mode?.kind === 'move' ? 'grab' : 'pointer');
</script>

<div class="tl" bind:clientWidth={width}>
  <svg {width} {height} role="slider" tabindex="0" aria-label={L.t['words.tl.label']}
    aria-valuemin={yearMin + BASE_MIN} aria-valuemax={yearMax} aria-valuenow={cmp.from}
    aria-valuetext="{blockLabel}, {baseLabel}"
    aria-describedby="wtl-keys" style:cursor={cursor}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
    onpointerleave={() => (hover = null)} onkeydown={key}>
    <g transform="translate({m.left},{m.top})">
      <!-- baseline band -->
      <rect class="base" x={xl(baseFrom)} width={xl(cmp.from) - xl(baseFrom)} y="-2" height={ih + 2} />
      {#if labels.base}<text class="blabel" x={labels.bx} y="-8" text-anchor="middle">{labels.base}</text>{/if}
      <g class="handle" class:active={hover === 'base' || mode?.kind === 'base'} transform="translate({xl(baseFrom)},0)">
        <line y1="-2" y2={ih} />
        <rect x="-4.5" y={ih / 2 - 12} width="9" height="24" rx="2.5" />
      </g>
      <!-- target block -->
      <rect class="block" x={xl(cmp.from)} width={xl(cmp.to + 1) - xl(cmp.from)} y="-2" height={ih + 2} />
      <text class="tlabel" x={labels.tx} y="-8" text-anchor="middle">{blockLabel}</text>

      {#each totals as v, i (i)}
        {@const y = yearMin + i}
        {@const inT = y >= cmp.from && y <= cmp.to}
        {@const inB = y >= baseFrom && y < cmp.from}
        <rect class="bar" class:t={inT} class:b={inB} class:partial={y === yearMax}
          x={xl(y) + step * 0.22} width={step * 0.56} y={ih - bh(v)} height={bh(v)} />
        {@const edge = inT && (y === cmp.from || y === cmp.to || step >= 34)}
        {@const near = labelEvery > 1 && !inT && (Math.abs(y - cmp.from) <= 1 || Math.abs(y - cmp.to) <= 1)}
        {#if ((y - yearMin) % labelEvery === 0 && !inT && !near) || edge}
          <text class="yl" class:t={inT} x={xl(y) + step / 2} y={ih + 13} text-anchor="middle">{step < 34 ? `'${String(y).slice(2)}` : y}</text>
        {/if}
      {/each}
      <line class="gpt" x1={xl(Math.floor(CHATGPT_X)) + step * (CHATGPT_X % 1)} x2={xl(Math.floor(CHATGPT_X)) + step * (CHATGPT_X % 1)} y1="0" y2={ih} />
    </g>
  </svg>
  <p class="hint">{L.t['words.tl.hint'](BASE_MIN, BASE_MAX)}</p>
  <p id="wtl-keys" class="sr-only">{L.t['words.tl.keys']}</p>
</div>

<style>
  .tl { width: 100%; }
  svg { display: block; overflow: visible; touch-action: none; user-select: none; }
  svg:focus-visible { outline: 2px solid var(--petrol); outline-offset: 3px; }
  .base { fill: var(--paper-3); stroke: var(--rule); stroke-dasharray: 3 2; }
  .block { fill: var(--petrol-tint); stroke: var(--petrol); stroke-width: 1.5; }
  .blabel { font-size: 11px; fill: var(--ink-2); }
  .tlabel { font-size: 12px; font-weight: 700; fill: var(--petrol); }
  .bar { fill: var(--context); }
  .bar.b { fill: var(--ink-3); }
  .bar.t { fill: var(--petrol); }
  .bar.partial { opacity: 0.45; }
  .yl { font-size: 11px; fill: var(--ink-3); }
  .yl.t { fill: var(--petrol); font-weight: 700; }
  .gpt { stroke: var(--ink-2); stroke-dasharray: 2 2; }
  .handle line { stroke: var(--ink-2); stroke-width: 1.5; }
  .handle rect { fill: var(--paper); stroke: var(--ink-2); stroke-width: 1.2; }
  .handle.active line, .handle.active rect { stroke: var(--petrol); }
  .hint { margin: 2px 0 0; font-size: var(--fs-xs); color: var(--ink-3); }
</style>
