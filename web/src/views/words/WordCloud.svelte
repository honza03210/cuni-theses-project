<script lang="ts">
  import cloud from 'd3-cloud';
  import { rampStep, type WordScore } from '../../lib/data/excess';
  import { L } from '../../lib/locale.svelte';
  import Tooltip from '../../lib/ui/Tooltip.svelte';

  interface Props { rising: WordScore[]; falling: WordScore[]; ramp: number[]; sizes: number[]; selected: string | null; onpick: (w: string) => void }
  let { rising, falling, ramp, sizes, selected, onpick }: Props = $props();

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

  $effect(() => {
    const w = width, h = height;
    const input = [
      ...rising.map((s) => ({ text: s.word, size: sizes[rampStep(s.score, ramp)], rise: true, s })),
      ...falling.map((s) => ({ text: s.word, size: sizes[rampStep(s.score, ramp)], rise: false, s })),
    ].sort((a, b) => b.size - a.size || a.text.localeCompare(b.text));
    let cancelled = false;
    ready = false;
    Promise.all([document.fonts.load(`700 20px "${FONT}"`), document.fonts.load(`400 20px "${FONT}"`)]).then(() => {
      if (cancelled) return;
      const layout = cloud<(typeof input)[number]>()
        .size([w, h])
        .words(input.map((d) => ({ ...d })))
        .padding(3)
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

  let hover: { s: WordScore; cx: number; cy: number } | null = $state(null);
  const dropped = $derived(rising.length + falling.length - placed.length);
  function onKey(e: KeyboardEvent, w: string) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onpick(w); }
  }
</script>

<div class="wrap" bind:clientWidth={width}>
  <svg {width} {height} class:ready role="group" aria-label="{L.t['words.more']} / {L.t['words.less']}">
    <g transform="translate({width / 2},{height / 2})">
      {#each placed as p (p.text)}
        <text
          role="button"
          class="w" class:rise={p.rise} class:fall={!p.rise} class:sel={selected === p.text}
          x={p.x} y={p.y} style:font-size="{p.size}px" text-anchor="middle" dy="0.35em"
          tabindex="0"
          aria-label="{p.text}: {p.rise ? L.t['words.more'] : L.t['words.less']}, {L.f.pct(p.s.observed, 1)} / {L.f.pct(p.s.expected, 1)}"
          aria-pressed={selected === p.text}
          onclick={() => onpick(p.text)}
          onkeydown={(e) => onKey(e, p.text)}
          onpointermove={(e) => (hover = { s: p.s, cx: e.clientX, cy: e.clientY })}
          onpointerleave={() => (hover = null)}
          onfocus={(e) => { const r = (e.currentTarget as SVGTextElement).getBoundingClientRect(); hover = { s: p.s, cx: r.right, cy: r.top + r.height / 2 }; }}
          onblur={() => (hover = null)}
        >{p.text}</text>
      {/each}
    </g>
  </svg>
  {#if ready && dropped > 0}<p class="note">+{dropped}</p>{/if}
  {#if hover}
    <Tooltip x={hover.cx} y={hover.cy}>
      <div class="tt-title">{hover.s.word}</div>
      <div class="tt-row"><span>{L.t['words.col.obs']}</span><b>{L.f.pct(hover.s.observed, 2)}</b></div>
      <div class="tt-row"><span>{L.t['words.col.exp']}</span><b>{L.f.pct(hover.s.expected, 2)}</b></div>
      <div class="tt-row"><span>{L.t['words.col.ratio']}</span><b>{L.f.signed(hover.s.score, 2)}</b></div>
      <div class="tt-row"><span>{L.t['words.col.docs']}</span><b>{L.f.int(hover.s.docs)}</b></div>
    </Tooltip>
  {/if}
</div>

<style>
  .wrap { width: 100%; position: relative; }
  svg { display: block; opacity: 0; transition: opacity 200ms var(--ease); }
  svg.ready { opacity: 1; }
  .w { cursor: pointer; font-family: var(--font); transition: opacity var(--t) var(--ease); }
  .w.rise { fill: var(--rise); font-weight: 700; }
  .w.fall { fill: var(--fall); font-weight: 400; }
  .w:hover, .w:focus-visible { text-decoration: underline; text-decoration-thickness: 1.5px; outline: none; }
  .w.sel { fill: var(--petrol); text-decoration: underline; text-decoration-thickness: 2.5px; paint-order: stroke; stroke: var(--petrol-tint); stroke-width: 6px; }
  svg:has(.w:hover) .w:not(:hover):not(.sel) { opacity: 0.55; }
  .note { position: absolute; right: 0; bottom: 0; margin: 0; font-size: var(--fs-xs); color: var(--ink-3); }
</style>
