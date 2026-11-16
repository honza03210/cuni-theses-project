<script lang="ts">
  import type { Snippet } from 'svelte';
  import { L } from '../locale.svelte';

  /** The view's answer line: one computed, plain-language finding, plus how to read the view. */
  interface Props { children: Snippet; howto: string }
  let { children, howto }: Props = $props();
</script>

<div class="lede">
  <p class="finding" aria-live="polite">{@render children()}</p>
  <details>
    <summary>{L.t['lede.howto']}</summary>
    <p>{howto}</p>
  </details>
</div>

<style>
  .lede { margin: 0 0 var(--s5); max-width: 92ch; }
  .finding {
    margin: 0;
    font-size: 1.3125rem;
    line-height: 1.4;
    color: var(--ink);
    text-wrap: pretty;
  }
  .finding :global(b) { font-weight: 700; }
  .finding :global(.rise) { color: var(--rise); }
  .finding :global(.fall) { color: var(--fall); }
  .finding :global(.muted) { color: var(--ink-2); }
  details { margin-top: 6px; font-size: var(--fs-sm); color: var(--ink-2); }
  summary {
    display: inline-flex; align-items: center; gap: 6px;
    cursor: pointer; color: var(--ink-2); font-weight: 600;
    list-style: none;
    text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 3px;
  }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: ''; width: 0; height: 0; border-left: 5px solid currentColor; border-top: 4px solid transparent; border-bottom: 4px solid transparent; transition: transform var(--t) var(--ease); }
  details[open] summary::before { transform: rotate(90deg); }
  summary:hover { color: var(--ink); text-decoration-color: var(--ink); }
  details p { margin: 6px 0 0; line-height: 1.55; max-width: 80ch; }
</style>
