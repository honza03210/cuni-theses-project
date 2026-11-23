<script lang="ts">
  import cloud from 'd3-cloud';
  import { rampStep, rankValue, type RankMode, type WordScore } from '../../lib/data/excess';
  import { L } from '../../lib/locale.svelte';
  import Tooltip from '../../lib/ui/Tooltip.svelte';

  interface Props { rising: WordScore[]; falling: WordScore[]; ramp: number[]; sizes: number[]; selected: string | null; onpick: (w: string) => void; forms?: ((w: string) => string[]) | null; mode?: RankMode; gloss?: ((w: string) => string | undefined) | null }
  let { rising, falling, ramp, sizes, selected, onpick, forms = null, mode = 'gap', gloss = null }: Props = $props();

  const FONT = 'Source Sans 3';
  let width = $state(800);
  const height = $derived(width < 640 ? 460 : 400);

  interface Placed { text: string; x: number; y: number; size: number; rise: boolean; s: WordScore }
  let placed: Placed[] = $state.raw([]);
  let ready = $state(false);

  function mulberry32(a: number) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Safety net: a font that finishes loading after the layout (slow phones) triggers one fresh layout,
  // so words measured with fallback metrics never stay overlapped.
  let fontEpoch = $state(0);
  $effect(() => {
    const bump = () => fontEpoch++;
    document.fonts.addEventListener('loadingdone', bump);
    return () => document.fonts.removeEventListener('loadingdone', bump);
  });

  $effect(() => {
    const w = width, h = height;
    void fontEpoch;
    const input = [
      ...rising.map((s) => ({ text: s.word, size: sizes[rampStep(rankValue(s, mode), ramp)], rise: true, s })),
      ...falling.map((s) => ({ text: s.word, size: sizes[rampStep(rankValue(s, mode), ramp)], rise: false, s })),
    ].sort((a, b) => b.size - a.size || a.text.localeCompare(b.text));
    let cancelled = false;
    // Load the font for the actual words: the Czech letters (č, ř, ů…) live in a separate latin-ext
    // subset, and measuring before it arrives lays words out with fallback widths, so they overlap.
    const sample = input.map((d) => d.text).join(' ');
    Promise.all([document.fonts.load(`700 20px "${FONT}"`, sample), document.fonts.load(`400 20px "${FONT}"`, sample)]).then(() => {
      if (cancelled) return;
      const layout = cloud<(typeof input)[number]>()
        .size([w, h])
        .words(input.map((d) => ({ ...d })))
        .padding(4)
        .rotate(0)
        .font(`"${FONT}"`)
        .fontWeight((d) => ((d as { rise: boolean }).rise ? 700 : 400))
        .fontSize((d) => (d as { size: number }).size)
        .random(mulberry32(7))
        .spiral('rectangular')
        .on('end', (out) => {
          if (cancelled) return;
          placed = out.map((d) => {
            const o = d as unknown as Placed;
            return { text: o.text, x: o.x, y: o.y, size: o.size, rise: o.rise, s: o.s };
          });
          ready = true;
        });
      layout.start();
    });
    return () => { cancelled = true; };
  });

  let hover: { s: WordScore; box: DOMRect } | null = $state(null);
  const showAt = (s: WordScore, el: Element) => (hover = { s, box: el.getBoundingClientRect() });
  const dropped = $derived(rising.length + falling.length - placed.length);

  // Fit the drawing to the words actually placed (no empty band above/below the cloud)
  const bounds = $derived.by(() => {
    if (!placed.length) return { top: -height / 2, h: height };
    let lo = Infinity, hi = -Infinity;
    // d3-cloud places the baseline at y: ascenders/diacritics reach ~0.95em above, descenders ~0.3em below
    for (const p of placed) { lo = Math.min(lo, p.y - p.size * 0.95); hi = Math.max(hi, p.y + p.size * 0.3); }
    return { top: lo - 6, h: hi - lo + 12 };
  });

  // Keyboard: the cloud is one tab stop; arrow keys move through words in reading order
  const order = $derived([...placed].sort((a, b) => (Math.abs(a.y - b.y) > 10 ? a.y - b.y : a.x - b.x)).map((p) => p.text));
  let active = $state(0);
  // the roving Tab stop starts on the selected word, so keyboard users land where the detail chart is
  $effect(() => { const i = selected ? order.indexOf(selected) : -1; if (i >= 0) active = i; });
  let svgEl: SVGSVGElement | undefined = $state();
  function focusWord(i: number) {
    active = Math.max(0, Math.min(order.length - 1, i));
    const el = svgEl?.querySelector<SVGTextElement>(`[data-w="${CSS.escape(order[active])}"]`);
    el?.focus();
  }
  function onKey(e: KeyboardEvent, w: string) {
    const i = order.indexOf(w);
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onpick(w); return; }
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) { e.preventDefault(); focusWord(i + step); }
    else if (e.key === 'Home') { e.preventDefault(); focusWord(0); }
    else if (e.key === 'End') { e.preventDefault(); focusWord(order.length - 1); }
  }
</script>

<div class="wrap" bind:clientWidth={width}>
  <svg bind:this={svgEl} {width} height={bounds.h} class:ready role="group" aria-label="{L.t['words.more']} / {L.t['words.less']}" aria-describedby="cloud-keys">
    <g transform="translate({width / 2},{-bounds.top})">
      {#each placed as p (p.text)}
        <text
          role="button"
          class="w" class:rise={p.rise} class:fall={!p.rise} class:sel={selected === p.text}
          style:transform="translate({p.x}px, {p.y}px)" style:font-size="{p.size}px" text-anchor="middle"
          tabindex={order[active] === p.text || (!order.includes(order[active]) && order[0] === p.text) ? 0 : -1}
          data-w={p.text}
          aria-label="{p.text}{gloss?.(p.text) ? ` (${gloss(p.text)})` : ''}: {p.rise ? L.t['words.more'] : L.t['words.less']}, {L.t['words.detail.observed']} {L.f.pct(p.s.observed, 1)}, {L.t['words.detail.expected']} {L.f.pct(p.s.expected, 1)}"
          aria-pressed={selected === p.text}
          onclick={() => onpick(p.text)}
          onkeydown={(e) => onKey(e, p.text)}
          onpointerenter={(e) => showAt(p.s, e.currentTarget)}
          onpointerleave={() => (hover = null)}
          onfocus={(e) => { active = order.indexOf(p.text); showAt(p.s, e.currentTarget); }}
          onblur={() => (hover = null)}
        >{p.text}</text>
      {/each}
    </g>
  </svg>
  {#if !ready}<p class="arranging" role="status">{L.t['words.cloud.arranging']}</p>{/if}
  <p id="cloud-keys" class="sr-only">{L.t['words.cloudKeys']}</p>
  {#if ready && dropped > 0}<p class="note">{L.t['words.cloud.dropped'](dropped)}</p>{/if}
  {#if hover}
    <Tooltip x={0} y={0} box={hover.box}>
      <div class="tt-title">{hover.s.word}{#if gloss?.(hover.s.word)}{' '}<span class="tt-gloss">‘{gloss(hover.s.word)}’</span>{/if}</div>
      {#if forms && forms(hover.s.word).length}<div class="tt-forms">{forms(hover.s.word).join(', ')}</div>{/if}
      <div class="tt-row"><span>{L.t['words.col.obs']}</span><b>{L.f.pct(hover.s.observed, 2)}</b></div>
      <div class="tt-row"><span>{L.t['words.col.exp']}</span><b>{L.f.pct(hover.s.expected, 2)}</b></div>
      <div class="tt-row"><span>{L.t['words.col.gap']}</span><b>{L.t['words.pp'](L.f.signed(hover.s.gap * 100, 1))}</b></div>
      <div class="tt-row"><span>{L.t['words.col.times']}</span><b>{L.t['words.ratio'](L.f.num(2 ** hover.s.score, 2))}</b></div>
      <div class="tt-row"><span>{L.t['words.col.docs']}</span><b>{L.f.int(hover.s.docs)}</b></div>
    </Tooltip>
  {/if}
</div>

<style>
  .wrap { width: 100%; position: relative; }
  svg { display: block; opacity: 0; transition: opacity 200ms var(--ease), height 500ms var(--ease); }
  svg.ready { opacity: 1; }
  .w { cursor: pointer; font-family: var(--font); transition: opacity var(--t) var(--ease), transform 700ms var(--ease), font-size 700ms var(--ease); animation: word-in 500ms var(--ease) both; }
  @keyframes word-in { from { opacity: 0; } }
  .w.rise { fill: var(--rise); font-weight: 700; }
  .w.fall { fill: var(--fall); font-weight: 400; }
  .w:hover, .w:focus-visible { text-decoration: underline; text-decoration-thickness: 1.5px; outline: none; }
  /* selected word keeps its rise/fall colour; selection is a thick ink underline, not another blue */
  .w.sel { text-decoration: underline; text-decoration-thickness: 3px; text-decoration-color: var(--ink); text-underline-offset: 4px; }
  svg:has(.w:hover) .w:not(:hover):not(.sel) { opacity: 0.55; }
  :global(.tt-gloss) { font-weight: 400; color: var(--ink-2); }
  :global(.tt-forms) { font-size: var(--fs-xs); color: var(--ink-3); margin: -1px 0 4px; font-style: italic; }
  /* first layout only: a quiet line in place of an empty sheet (later re-layouts keep the old cloud) */
  .arranging { position: absolute; inset: 0 0 auto; margin: 0; padding: var(--s6) 0; text-align: center; font-size: var(--fs-sm); color: var(--ink-3); }
  .note { margin: var(--s2) 0 0; text-align: right; font-size: var(--fs-xs); color: var(--ink-3); }
</style>
