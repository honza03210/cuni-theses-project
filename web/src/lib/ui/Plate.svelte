<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app } from '../state/app.svelte';
  import { L } from '../locale.svelte';

  interface Props {
    id: string;
    title: string;
    unit?: string;
    foot?: string;
    tools?: Snippet;
    /** controls shown above the body in both chart and table mode */
    lead?: Snippet;
    /** footnote for table mode (defaults to foot) */
    footTable?: string;
    table?: Snippet;
    children: Snippet;
    grow?: boolean;
    /** keep the header (title, legend, tools) visible while the body scrolls */
    stickyHead?: boolean;
    /** render the lead (controls) after the chart instead of before it */
    leadLast?: boolean;
    /** simple version: offer the table to screen readers (off when it holds buttons, which would be invisible focus stops) */
    srTable?: boolean;
  }
  let { id, title, unit, foot, tools, lead, footTable, table, children, grow = false, stickyHead = false, leadLast = false, srTable = true }: Props = $props();

  // the simple version always shows the chart: tables, footnotes and sources are detail
  const showTable = $derived(!!table && !!app.table[id] && app.detailed);
  function setTable(v: boolean) {
    const next = { ...app.table };
    if (v) next[id] = true; else delete next[id];
    app.table = next;
  }
</script>

<section class="plate" class:grow aria-labelledby="{id}-title">
  <header class="head" class:sticky={stickyHead}>
    <div class="titles">
      <h2 id="{id}-title">{title}</h2>
      {#if unit}<p class="unit">{unit}</p>{/if}
    </div>
    <div class="tools">
      {@render tools?.()}
      {#if table && app.detailed}
        <!-- a viewing preference, not a selection: a quiet text toggle, so petrol stays for real choices -->
        <button type="button" class="view-toggle" aria-pressed={showTable} onclick={() => setTable(!showTable)}>
          {showTable ? L.t['plate.showChart'] : L.t['plate.showTable']}
        </button>
      {/if}
    </div>
  </header>
  {#if lead && !leadLast}<div class="lead">{@render lead()}</div>{/if}
  <div class="body">
    {#if showTable}
      <div class="table-wrap">{@render table!()}</div>
    {:else}
      {@render children()}
      <!-- the simple version has no table toggle: screen readers still get every chart as a table -->
      {#if table && srTable && !app.detailed}<div class="sr-only">{@render table()}</div>{/if}
    {/if}
  </div>
  {#if lead && leadLast}<div class="lead last">{@render lead()}</div>{/if}
  <footer class="foot full-only">
    {#if showTable && footTable}<span>{footTable}</span>{:else if foot}<span>{foot}</span>{/if}
    <span class="src">{L.t['plate.source']}</span>
  </footer>
</section>

<style>
  .plate {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .plate.grow { flex: 1 1 auto; }
  /* a growing plate hands its spare height to the chart (children may opt in with flex: 1) */
  .plate.grow > .body { flex: 1 1 auto; display: flex; flex-direction: column; }
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--s2) var(--s4);
    padding: 10px var(--s4);
    background: var(--plate-head);
    border-bottom: 1px solid var(--rule);
    border-radius: 4px 4px 0 0;
  }
  .head.sticky { position: sticky; top: var(--band-h, 58px); z-index: 6; }
  /* on phones the tall header would eat the screen; the view keeps its own compact sticky control */
  @media (max-width: 639px) { .head.sticky { position: static; } }
  .titles { min-width: 0; flex: 1 1 340px; }
  h2 {
    margin: 0;
    /* a clear step above the 16px body text */
    font-size: var(--fs-xl);
    font-weight: 700;
    line-height: 1.25;
    letter-spacing: -0.005em;
    text-wrap: balance;
  }
  .unit {
    margin: 2px 0 0;
    font-size: var(--fs-sm);
    color: var(--ink-3);
    text-wrap: pretty;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: var(--s3);
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .lead { padding: var(--s3) 0 0; }
  .body {
    position: relative;
    padding: var(--s3) 0;
    min-height: 0;
    flex: 1 1 auto;
  }
  .table-wrap { overflow: auto; max-height: 560px; }
  @media (max-width: 639px) {
    .head { flex-direction: column; align-items: stretch; gap: var(--s2); }
    .titles { flex: 0 0 auto; }
    .tools { justify-content: flex-start; }
  }
  /* simple version: no tinted head box, just the title on a hairline */
  :global(.simple) .head { background: none; padding: 0 0 8px; border-radius: 0; }
  :global(.simple) .unit { color: var(--ink-3); }
  .view-toggle {
    border: 0; background: none; padding: 4px 2px; cursor: pointer;
    font-size: var(--fs-sm); font-weight: 600; color: var(--ink-2);
    text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 3px;
  }
  .view-toggle:hover { color: var(--ink); text-decoration-color: var(--ink); }
  @media (pointer: coarse) { .view-toggle { min-height: 40px; padding: 8px 4px; } }
  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--s2);
    padding: var(--s2) 0 0;
    border-top: 1px solid var(--rule);
    font-size: var(--fs-xs);
    color: var(--ink-3);
    line-height: 1.5;
  }
  .foot span:first-child:not(.src) { max-width: 110ch; }
  .src { font-style: italic; }


  /* ruled yearbook tables */
  .table-wrap :global(table) {
    border-collapse: collapse;
    font-size: var(--fs-sm);
    width: 100%;
  }
  .table-wrap :global(th) {
    position: sticky; top: 0;
    background: var(--paper);
    text-align: right;
    font-weight: 600;
    color: var(--ink-2);
    padding: 4px 10px;
    border-bottom: 1px solid var(--ink);
    white-space: nowrap;
  }
  .table-wrap :global(th:first-child), .table-wrap :global(td:first-child) { text-align: left; }
  .table-wrap :global(td) {
    padding: 3px 10px;
    text-align: right;
    border-bottom: 1px solid var(--rule-soft);
    white-space: nowrap;
  }
  .table-wrap :global(tbody tr:hover td) { background: var(--paper-2); }
  .table-wrap :global(td.muted) { color: var(--ink-3); }
</style>
