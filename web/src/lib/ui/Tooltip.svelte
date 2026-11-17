<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Follows the pointer at (x, y); with `box`, sits below (or above) that element instead, never covering it. */
  interface Props { x: number; y: number; box?: { left: number; top: number; bottom: number } | null; children: Snippet }
  let { x, y, box = null, children }: Props = $props();

  let el: HTMLDivElement | undefined = $state();
  let w = $state(0), h = $state(0);
  const left = $derived(box
    ? Math.max(8, Math.min(box.left, window.innerWidth - w - 8))
    : x + 14 + w > window.innerWidth - 8 ? x - 14 - w : x + 14);
  const top = $derived(box
    ? (box.bottom + 8 + h <= window.innerHeight - 8 ? box.bottom + 8 : Math.max(8, box.top - 8 - h))
    : Math.max(8, Math.min(y - h / 2, window.innerHeight - h - 8)));
</script>

<div class="tip" role="tooltip" bind:this={el} bind:clientWidth={w} bind:clientHeight={h}
  style:left="{left}px" style:top="{top}px">
  {@render children()}
</div>

<style>
  .tip {
    position: fixed;
    z-index: 50;
    pointer-events: none;
    max-width: 280px;
    padding: 8px 10px;
    background: var(--paper);
    border: 1px solid var(--ink);
    box-shadow: 0 4px 14px var(--shadow);
    font-size: var(--fs-sm);
    line-height: 1.4;
    color: var(--ink);
  }
  .tip :global(.tt-title) { font-weight: 700; margin-bottom: 2px; }
  .tip :global(.tt-row) { display: flex; justify-content: space-between; gap: 16px; color: var(--ink-2); }
  .tip :global(.tt-row b) { color: var(--ink); font-weight: 600; }
  .tip :global(.swatch) { display: inline-block; width: 9px; height: 9px; margin-right: 5px; border-radius: 1px; vertical-align: 0; }
</style>
