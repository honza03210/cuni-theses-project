<script lang="ts">
  import { brushY, scaleLinear, select, type BrushBehavior } from 'd3';
  import type { Theses } from '../../lib/data/types';
  import { GRADE_HEX, GRADE_VARS } from '../../lib/chart';
  import { app } from '../../lib/state/app.svelte';
  import { L } from '../../lib/locale.svelte';
  import Plate from '../../lib/ui/Plate.svelte';

  interface Props { theses: Theses; mask: Uint8Array }
  let { theses, mask }: Props = $props();

  const AXES = ['grade', 'mean_word_len', 'std_sentence_len', 'mean_sentence_len', 'mattr', 'repeated_trigram_ratio', 'long_word_ratio'];
  const meta = $derived(theses.meta);
  const metricOf = (k: string) => meta.metrics.find((m) => m.key === k)!;

  /** Rows: masked, clean body, graded, every metric finite. Values normalised to 0 (bottom) .. 1 (top). */
  const data = $derived.by(() => {
    const keys = AXES.slice(1);
    const cols = keys.map((k) => theses.metrics[k]);
    const idx: number[] = [];
    outer: for (let i = 0; i < theses.n; i++) {
      if (!mask[i] || !theses.clean[i]) continue;
      const g = theses.grade[i];
      if (g < 1 || g > 4) continue;
      for (const c of cols) if (!Number.isFinite(c[i])) continue outer;
      idx.push(i);
    }
    // deterministic shuffle so no grade is always drawn on top
    let s = 0x9e3779b9;
    for (let i = idx.length - 1; i > 0; i--) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const j = (s >>> 0) % (i + 1);
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const n = idx.length, A = AXES.length;
    const norm = new Float32Array(n * A);
    const raw = new Float32Array(n * A);
    const grade = new Uint8Array(n);
    for (let r = 0; r < n; r++) {
      const i = idx[r];
      const g = theses.grade[i];
      grade[r] = g;
      // grade band: 1 on top. Jitter within the band (stable per row).
      const jitter = (((i * 2654435761) >>> 0) / 4294967296 - 0.5) * 0.62;
      raw[r * A] = g;
      norm[r * A] = 1 - (g - 1 + 0.5 + jitter) / 4;
      for (let a = 1; a < A; a++) {
        const m = metricOf(AXES[a]);
        const v = cols[a - 1][i];
        raw[r * A + a] = v;
        norm[r * A + a] = Math.max(0, Math.min(1, (v - m.p01) / (m.p99 - m.p01)));
      }
    }
    return { n, norm, raw, grade };
  });

  let hidden = $state<number[]>([]);
  let live = $state<Record<string, [number, number]>>({ ...app.brushes });
  $effect(() => { live = { ...app.brushes }; });

  // selection mask from brushes (in data units)
  const selection = $derived.by(() => {
    const A = AXES.length;
    const active = AXES.map((k, a) => ({ a, r: live[k] })).filter((x) => x.r);
    const sel = new Uint8Array(data.n);
    let count = 0;
    for (let r = 0; r < data.n; r++) {
      let ok = !hidden.includes(data.grade[r]);
      for (const { a, r: rng } of active) {
        if (!ok) break;
        const v = a === 0 ? data.raw[r * A] : data.raw[r * A + a];
        if (v < rng![0] || v > rng![1]) ok = false;
      }
      if (ok) { sel[r] = 1; count++; }
    }
    return { sel, count, any: active.length > 0 };
  });

  let width = $state(900);
  const height = 380;
  const m = { top: 34, right: 56, bottom: 26, left: 56 };
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const ih = height - m.top - m.bottom;
  const ax = (a: number) => (iw * a) / (AXES.length - 1);

  let canvas: HTMLCanvasElement | undefined = $state();
  let raf = 0;

  function draw() {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.translate(m.left, m.top);
    ctx.lineWidth = 0.7;
    const A = AXES.length;
    const { n, norm, grade } = data;
    const { sel, any } = selection;
    const alpha = Math.max(0.025, Math.min(0.5, 900 / Math.max(1, n)));
    const xs = AXES.map((_, a) => ax(a));
    const trace = (r: number) => {
      const o = r * A;
      ctx.moveTo(xs[0], ih * (1 - norm[o]));
      for (let a = 1; a < A; a++) ctx.lineTo(xs[a], ih * (1 - norm[o + a]));
    };
    // context layer: deselected theses stay as a faint trace (nothing disappears)
    if (any || hidden.length) {
      ctx.strokeStyle = `rgba(28,31,36,${Math.min(0.02, alpha * 0.45)})`;
      ctx.beginPath();
      let k = 0;
      for (let r = 0; r < n; r++) {
        if (sel[r]) continue;
        trace(r);
        if (++k % 2000 === 0) { ctx.stroke(); ctx.beginPath(); }
      }
      ctx.stroke();
    }
    // grade-coloured layer, batched per grade in shuffled order chunks
    const chunk = 1500;
    const a2 = any ? Math.min(0.6, alpha * 1.8) : alpha;
    // Rarer grades get more ink (sqrt of inverse share) so all four stay visible; stated in the footnote.
    const per = [0, 0, 0, 0];
    for (let r = 0; r < n; r++) per[grade[r] - 1]++;
    const boost = per.map((c) => (c ? Math.sqrt(n / (4 * c)) : 1));
    for (let start = 0; start < n; start += chunk) {
      for (let g = 1; g <= 4; g++) {
        const hex = GRADE_HEX[g - 1];
        // light blue (grade 2) needs extra weight against the paper ground
        const ga = (g === 2 ? a2 * 1.6 : a2) * boost[g - 1];
        ctx.strokeStyle = hexA(hex, Math.min(0.9, ga));
        ctx.beginPath();
        const end = Math.min(n, start + chunk);
        for (let r = start; r < end; r++) if (grade[r] === g && sel[r]) trace(r);
        ctx.stroke();
      }
    }
  }
  function hexA(hex: string, a: number) {
    const v = parseInt(hex.slice(1), 16);
    return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
  }
  $effect(() => {
    // dependencies
    void data; void selection; void width; void canvas;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });

  // ---- brushes (SVG overlay) ----
  function scaleFor(k: string) {
    if (k === 'grade') return scaleLinear().domain([4.5, 0.5]).range([ih, 0]); // value -> px
    const mm = metricOf(k);
    return scaleLinear().domain([mm.p01, mm.p99]).range([ih, 0]);
  }
  function brushAxis(node: SVGGElement, k: string) {
    const sc = scaleFor(k);
    const b: BrushBehavior<unknown> = brushY().extent([[-11, 0], [11, ih]])
      .on('brush', (e) => {
        if (!e.sourceEvent || !e.selection) return;
        const [p0, p1] = e.selection as [number, number];
        live = { ...live, [k]: [Math.min(sc.invert(p0), sc.invert(p1)), Math.max(sc.invert(p0), sc.invert(p1))] };
      })
      .on('end', (e) => {
        if (!e.sourceEvent) return;
        const next = { ...app.brushes };
        if (!e.selection) delete next[k];
        else {
          const [p0, p1] = e.selection as [number, number];
          next[k] = [Math.min(sc.invert(p0), sc.invert(p1)), Math.max(sc.invert(p0), sc.invert(p1))];
        }
        app.brushes = next;
      });
    const g = select(node).call(b);
    const sync = () => {
      const r = app.brushes[k];
      const clamp = (v: number) => Math.max(0, Math.min(ih, v));
      if (!r) { g.call(b.move, null); return; }
      const a = clamp(sc(r[0])), c = clamp(sc(r[1]));
      g.call(b.move, [Math.min(a, c), Math.max(a, c)]);
    };
    sync();
    return { update: sync };
  }
  // re-sync brush rectangles whenever app.brushes changes (e.g. clear button, URL)
  let brushVersion = $derived(JSON.stringify(app.brushes));

  function clearBrushes() { app.brushes = {}; }
  function toggleGrade(g: number) {
    hidden = hidden.includes(g) ? hidden.filter((x) => x !== g) : [...hidden, g];
  }

  const axisLabel = (k: string) => (k === 'grade' ? L.t['grade.axis'] : L.pick(metricOf(k).label));
  const axisTicks = (k: string) => {
    if (k === 'grade') return [1, 2, 3, 4].map((g) => ({ y: ih * ((g - 0.5) / 4), t: String(g) }));
    const mm = metricOf(k);
    const sc = scaleLinear().domain([mm.p01, mm.p99]).range([ih, 0]);
    return sc.ticks(4).map((v) => ({ y: sc(v), t: L.f.num(v, Math.max(0, mm.decimals - 1)) }));
  };

  // summary table per grade
  const summary = $derived.by(() => {
    const A = AXES.length;
    const sums = Array.from({ length: 4 }, () => new Float64Array(A));
    const cnt = new Uint32Array(4);
    for (let r = 0; r < data.n; r++) {
      if (!selection.sel[r]) continue;
      const g = data.grade[r] - 1;
      cnt[g]++;
      for (let a = 1; a < A; a++) sums[g][a] += data.raw[r * A + a];
    }
    return [0, 1, 2, 3].map((g) => ({ g: g + 1, n: cnt[g], means: AXES.map((_, a) => (cnt[g] ? sums[g][a] / cnt[g] : NaN)) }));
  });
</script>

<Plate id="g-par" title={L.t['grades.par.title']} unit={L.t['grades.par.unit']} foot={L.t['grades.par.foot']}>
  {#snippet tools()}
    <div class="gtoggles" role="group" aria-label={L.t['grades.par.toggle']}>
      {#each [1, 2, 3, 4] as g (g)}
        <button type="button" aria-pressed={!hidden.includes(g)} onclick={() => toggleGrade(g)} title="{g} {L.t[`grade.${g}` as 'grade.1']}">
          <span class="sw" class:hatch={g === 4} style:background={GRADE_VARS[g - 1]}></span>{g}
        </button>
      {/each}
    </div>
    <span class="selcount" aria-live="polite">{L.t['grades.par.selected'](L.f.int(selection.count), L.f.int(data.n))}</span>
    {#if selection.any}<button type="button" class="clear" onclick={clearBrushes}>{L.t['grades.par.clear']}</button>{/if}
  {/snippet}
  {#snippet table()}
    <table>
      <thead><tr><th>{L.t['grade.axis']}</th><th>{L.t['common.n']}</th>{#each AXES.slice(1) as k (k)}<th>{axisLabel(k)}</th>{/each}</tr></thead>
      <tbody>
        {#each summary as s (s.g)}
          <tr><td>{s.g} {L.t[`grade.${s.g}` as 'grade.1']}</td><td class="muted">{L.f.int(s.n)}</td>
            {#each AXES.slice(1) as k, a (k)}<td>{Number.isFinite(s.means[a + 1]) ? L.f.num(s.means[a + 1], metricOf(k).decimals) : '–'}</td>{/each}</tr>
        {/each}
      </tbody>
    </table>
  {/snippet}

  <div class="wrap" bind:clientWidth={width} style:height="{height}px">
    <canvas bind:this={canvas} style:width="{width}px" style:height="{height}px" aria-hidden="true"></canvas>
    <svg {width} {height} role="group" aria-label={L.t['grades.par.title']}>
      <g transform="translate({m.left},{m.top})">
        {#each AXES as k, a (k)}
          <g transform="translate({ax(a)},0)">
            <line class="axis-line" y1="0" y2={ih} />
            {#each axisTicks(k) as t (t.t + t.y)}
              <line class="tick" x1="-3" x2="0" y1={t.y} y2={t.y} />
              <text class="tl" x="-6" y={t.y} dy="0.32em" text-anchor="end">{t.t}</text>
            {/each}
            <text class="al" y="-14" text-anchor={a === 0 ? 'start' : a === AXES.length - 1 ? 'end' : 'middle'} x={a === 0 ? -8 : a === AXES.length - 1 ? 8 : 0}>{axisLabel(k)}</text>
            {#key brushVersion + ih}
              <g class="brush" use:brushAxis={k}></g>
            {/key}
          </g>
        {/each}
      </g>
    </svg>
  </div>
</Plate>

<style>
  .wrap { position: relative; width: 100%; }
  canvas, svg { position: absolute; left: 0; top: 0; display: block; }
  svg { overflow: visible; }
  .axis-line { stroke: var(--ink); stroke-width: 1; shape-rendering: crispEdges; }
  .tick { stroke: var(--ink); shape-rendering: crispEdges; }
  .tl { font-size: 10px; fill: var(--ink-2); paint-order: stroke; stroke: var(--paper); stroke-width: 3px; }
  .al { font-size: 12px; font-weight: 600; fill: var(--ink); }
  .brush :global(.selection) { fill: var(--petrol); fill-opacity: 0.12; stroke: var(--petrol); stroke-width: 1.5; }
  .brush :global(.overlay) { cursor: crosshair; }
  .gtoggles { display: inline-flex; gap: 2px; }
  .gtoggles button {
    display: inline-flex; align-items: center; gap: 4px;
    border: 1px solid var(--rule); background: var(--paper); border-radius: 3px;
    padding: 2px 7px; font-size: var(--fs-sm); cursor: pointer; color: var(--ink);
  }
  .gtoggles button[aria-pressed='false'] { color: var(--ink-3); text-decoration: line-through; }
  .gtoggles button[aria-pressed='false'] .sw { opacity: 0.25; }
  .sw { width: 10px; height: 10px; border-radius: 1px; box-shadow: inset 0 0 0 1px rgb(28 31 36 / 0.25); }
  .sw.hatch { background-image: repeating-linear-gradient(135deg, rgb(255 255 255 / 0.55) 0 1.5px, transparent 1.5px 4px) !important; background-color: var(--grade-4); }
  .selcount { font-size: var(--fs-sm); color: var(--ink-2); }
  .clear { border: 1px solid var(--petrol); color: var(--petrol); background: var(--paper); border-radius: 3px; padding: 2px 9px; font-size: var(--fs-sm); cursor: pointer; }
  .clear:hover { background: var(--petrol-tint); }
</style>
