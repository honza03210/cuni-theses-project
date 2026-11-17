<script lang="ts">
  import { brushY, scaleLinear, select, type BrushBehavior } from 'd3';
  import type { Theses } from '../../lib/data/types';
  import { GRADE_HEX, GRADE_VARS } from '../../lib/chart';
  const CONTEXT_HEX = '#8f897b';
  import { app } from '../../lib/state/app.svelte';
  import { L } from '../../lib/locale.svelte';
  import Plate from '../../lib/ui/Plate.svelte';

  interface Props { theses: Theses; mask: Uint8Array }
  let { theses, mask }: Props = $props();

  // measures ordered by how far the median excellent and failed thesis sit apart across all theses
  // (largest gap next to the grade axis), so the eye meets the strongest difference first
  const AXES = ['grade', 'repeated_trigram_ratio', 'mean_sentence_len', 'std_sentence_len', 'mean_word_len', 'long_word_ratio', 'mattr'];
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
  let showLines = $state(false);

  /** Median and quartiles per grade per axis (normalised 0..1), over the selected theses. */
  const bands = $derived.by(() => {
    const A = AXES.length;
    const out: { g: number; n: number; q1: number[]; med: number[]; q3: number[] }[] = [];
    for (let g = 1; g <= 4; g++) {
      if (hidden.includes(g)) continue;
      const rows: number[] = [];
      for (let r = 0; r < data.n; r++) if (data.grade[r] === g && selection.sel[r]) rows.push(r);
      if (rows.length < 20) continue;
      const q1: number[] = [], med: number[] = [], q3: number[] = [];
      const centre = 1 - (g - 0.5) / 4;
      for (let a = 0; a < A; a++) {
        if (a === 0) { q1.push(centre); med.push(centre); q3.push(centre); continue; }
        const vals = Float32Array.from(rows, (r) => data.norm[r * A + a]).sort();
        const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
        q1.push(q(0.25)); med.push(q(0.5)); q3.push(q(0.75));
      }
      out.push({ g, n: rows.length, q1, med, q3 });
    }
    return out;
  });
  // do the grades' medians nearly coincide on every measure? (within 10 % of each axis range)
  const overlap = $derived.by(() => {
    if (bands.length < 2) return false;
    for (let a = 1; a < AXES.length; a++) {
      const meds = bands.map((b) => b.med[a]);
      if (Math.max(...meds) - Math.min(...meds) > 0.1) return false;
    }
    return true;
  });
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
  const m = { top: 46, right: 56, bottom: 26, left: 56 };
  const iw = $derived(Math.max(10, width - m.left - m.right));
  const ih = height - m.top - m.bottom;
  // the grade axis only fans theses out into their grades: give it half a gap
  const gap0 = $derived((iw / (AXES.length - 1)) * 0.5);
  const ax = (a: number) => (a === 0 ? 0 : gap0 + ((iw - gap0) * (a - 1)) / (AXES.length - 2));

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
    const A = AXES.length;
    const { n, norm, grade } = data;
    const { sel, any } = selection;
    const alpha = Math.max(0.025, Math.min(0.5, 900 / Math.max(1, n)));
    const xs = AXES.map((_, a) => ax(a));
    // Density layers: lines accumulate in an alpha-only offscreen canvas, which is then
    // tinted with the exact palette colour ("source-in"). Blending low-alpha colours
    // directly drifts hues toward black in 8-bit canvas maths.
    const layer = (keep: (r: number) => boolean, lineAlpha: number, color: string, opacity: number) => {
      const off = offscreen(canvas!.width, canvas!.height);
      const o = off.getContext('2d')!;
      o.setTransform(dpr, 0, 0, dpr, 0, 0);
      o.clearRect(0, 0, width, height);
      o.translate(m.left, m.top);
      o.lineWidth = 0.7;
      o.strokeStyle = `rgba(0,0,0,${Math.max(1 / 255, Math.min(0.9, lineAlpha))})`;
      o.beginPath();
      let k = 0;
      for (let r = 0; r < n; r++) {
        if (!keep(r)) continue;
        const b = r * A;
        o.moveTo(xs[0], ih * (1 - norm[b]));
        for (let a = 1; a < A; a++) o.lineTo(xs[a], ih * (1 - norm[b + a]));
        if (++k % 2000 === 0) { o.stroke(); o.beginPath(); }
      }
      o.stroke();
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.globalCompositeOperation = 'source-in';
      o.fillStyle = color;
      o.fillRect(0, 0, off.width, off.height);
      o.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = opacity;
      ctx.drawImage(off, 0, 0);
      ctx.restore();
    };
    if (!showLines) return;
    // context layer: deselected theses stay as faint grey context (nothing disappears)
    if (any || hidden.length) layer((r) => !sel[r], alpha, CONTEXT_HEX, 0.22);
    const a2 = any ? Math.min(0.6, alpha * 1.6) : alpha;
    // Every thesis gets the same ink, so the cloud shows the true proportions of grades.
    // Lines sit under the median/quartile bands (SVG), which carry the comparison.
    for (let g = 1; g <= 4; g++) {
      // light blue (grade 2) needs extra weight against the paper ground
      const ga = g === 2 ? a2 * 1.6 : a2;
      layer((r) => grade[r] === g && sel[r] === 1, ga, GRADE_HEX[g - 1], 0.55);
    }
  }
  const offs: HTMLCanvasElement[] = [];
  let offIdx = 0;
  function offscreen(w: number, h: number) {
    // reuse a small pool of canvases between layers
    const c = offs[offIdx % 2] ?? (offs[offIdx % 2] = document.createElement('canvas'));
    offIdx++;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return c;
  }
  $effect(() => {
    // dependencies
    void data; void selection; void width; void canvas; void showLines;
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

  /** Break an axis title into two lines when it is wider than the axis spacing (~6.4 px/char at 12px). */
  function splitLabel(t: string, spacing: number): string[] {
    if (t.length * 6.4 < spacing - 12) return [t];
    const words = t.split(' ');
    if (words.length < 2) return [t];
    let best = 1, bestD = Infinity;
    for (let i = 1; i < words.length; i++) {
      const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
      if (d < bestD) { bestD = d; best = i; }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
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
    <label class="lines"><input type="checkbox" bind:checked={showLines} />{L.t['grades.par.lines']}</label>
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

  <p class="bandkey">
    <svg width="26" height="12" aria-hidden="true"><rect x="0" y="2" width="26" height="8" fill="var(--ink-3)" opacity="0.3"/><line x1="0" x2="26" y1="6" y2="6" stroke="var(--ink)" stroke-width="2"/></svg>
    <span>{L.t['grades.par.bands']}</span>
  </p>
  {#if overlap}<p class="par-note">{L.t['grades.par.overlap']}</p>{/if}
  <p class="scroll-hint">{L.t['grades.par.scroll']}</p>
  <div class="scroll">
  <div class="wrap" bind:clientWidth={width} style:height="{height}px">
    <canvas bind:this={canvas} style:width="{width}px" style:height="{height}px" aria-hidden="true"></canvas>
    <svg {width} {height} role="group" aria-label={L.t['grades.par.title']}>
      <g transform="translate({m.left},{m.top})">
        <!-- rare grades first, so the common grades' medians stay on top; each grade has its own dash -->
        {#each [...bands].reverse() as b (b.g)}
          {@const xs = AXES.map((_, a) => ax(a))}
          <path class="band" class:hatched={b.g === 4}
            d={'M' + xs.map((x, a) => `${x},${ih * (1 - b.q3[a])}`).join('L') + 'L' + xs.map((x, a) => `${x},${ih * (1 - b.q1[a])}`).reverse().join('L') + 'Z'} />
          <path class="median-halo" class:pale={b.g === 2} d={'M' + xs.map((x, a) => `${x},${ih * (1 - b.med[a])}`).join('L')} />
          <path class="median" stroke={GRADE_HEX[b.g - 1]} stroke-dasharray={['', '9 3', '5 3', '2 3'][b.g - 1]} d={'M' + xs.map((x, a) => `${x},${ih * (1 - b.med[a])}`).join('L')} />
        {/each}
        {#each AXES as k, a (k)}
          {@const lines = splitLabel(axisLabel(k), iw / (AXES.length - 1))}
          <g transform="translate({ax(a)},0)">
            <line class="axis-line" y1="0" y2={ih} />
            {#each axisTicks(k) as t (t.t + t.y)}
              <line class="tick" x1="-3" x2="0" y1={t.y} y2={t.y} />
              <text class="tl" x="-6" y={t.y} dy="0.32em" text-anchor="end">{t.t}</text>
            {/each}
            <text class="al" y={lines.length > 1 ? -26 : -14} text-anchor={a === 0 ? 'start' : a === AXES.length - 1 ? 'end' : 'middle'} x={a === 0 ? -8 : a === AXES.length - 1 ? 8 : 0}>
              {#each lines as ln, li (li)}<tspan x={a === 0 ? -8 : a === AXES.length - 1 ? 8 : 0} dy={li ? '1.15em' : 0}>{ln}</tspan>{/each}
            </text>
            {#key brushVersion + ih}
              <g class="brush" use:brushAxis={k}></g>
            {/key}
          </g>
        {/each}
      </g>
    </svg>
  </div>
  </div>
</Plate>

<style>
  .scroll { overflow-x: auto; }
  .par-note { margin: 0 0 6px; font-size: var(--fs-sm); color: var(--ink); font-weight: 600; }
  .scroll-hint { display: none; margin: 0 0 4px; font-size: var(--fs-xs); color: var(--ink-3); }
  @media (max-width: 720px) { .scroll-hint { display: block; } }
  @media (pointer: coarse) {
    .gtoggles button { min-height: 40px; min-width: 44px; }
    .lines { min-height: 40px; }
    .lines input { width: 20px; height: 20px; }
  }
  .wrap { position: relative; width: 100%; min-width: 660px; }
  /* bands: faint fill plus a thin edge, so four overlapping bands stay separable (dark mode mixes fills into mud) */
  /* bands are neutral (they overlap almost completely); grade colour lives on the median lines only */
  .band { fill: var(--ink-3); fill-opacity: 0.09; stroke: none; }
  .median { fill: none; stroke-width: 2.4; stroke-linejoin: round; }
  /* a thin ink contour gives the light grade-2 line enough contrast on paper (and on charcoal in dark mode) */
  .median-halo { fill: none; stroke: var(--ink); stroke-width: 4.6; stroke-linejoin: round; opacity: 0.45; }
  /* pale-sky grade 2 needs a full-strength casing to stay visible on paper */
  .median-halo.pale { stroke-width: 5.2; opacity: 0.85; }
  .bandkey { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 4px; font-size: var(--fs-sm); color: var(--ink-2); }
  .lines { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--ink-2); cursor: pointer; }
  .lines input { margin: 0; }
  .wrap > canvas, .wrap > svg { position: absolute; left: 0; top: 0; display: block; }
  .wrap > svg { overflow: visible; }
  .axis-line { stroke: var(--ink); stroke-width: 1; shape-rendering: crispEdges; }
  .tick { stroke: var(--ink); shape-rendering: crispEdges; }
  .tl { font-size: 11px; fill: var(--ink-2); paint-order: stroke; stroke: var(--paper); stroke-width: 4px; stroke-linejoin: round; }
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
  .sw { width: 10px; height: 10px; border-radius: 1px; box-shadow: inset 0 0 0 1px var(--swatch-edge); }
  .sw.hatch { background-image: repeating-linear-gradient(135deg, rgb(255 255 255 / 0.55) 0 1.5px, transparent 1.5px 4px) !important; background-color: var(--grade-4); }
  .selcount { font-size: var(--fs-sm); color: var(--ink-2); }
  .clear { border: 1px solid var(--ink-3); color: var(--ink); background: var(--paper); border-radius: 3px; padding: 2px 9px; font-size: var(--fs-sm); cursor: pointer; }
  .clear:hover { border-color: var(--ink); background: var(--paper-2); }
</style>
