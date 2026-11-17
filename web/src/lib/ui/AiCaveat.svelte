<script module lang="ts">
  import { app } from '../state/app.svelte';
  import { L } from '../locale.svelte';

  /** "theses marked “declared use / declared no use”" for the current AI-declaration filter. */
  export function aiWho(): string {
    return L.t['ai.groups'](app.ai.map((a) => L.t[`ai.${a}` as 'ai.1']).join(' / '));
  }
</script>

<script lang="ts">
  /** Inline warning shown in a plate while the AI-declaration filter narrows 2023+:
   *  the comparison is between two groups of students, not before and after. */
  interface Props { span: string }
  let { span }: Props = $props();
</script>

<p class="caveat" role="note">
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6v3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.6" r="0.95" fill="currentColor"/></svg>
  <span>{L.t['ai.caveat'](aiWho(), span)}</span>
</p>

<style>
  .caveat {
    display: flex; gap: 8px; align-items: flex-start;
    margin: 0 0 var(--s3); max-width: 90ch;
    font-size: var(--fs-sm); line-height: 1.45; color: var(--warn); font-weight: 600;
    text-wrap: pretty;
  }
  svg { flex: none; margin-top: 2px; }
</style>
