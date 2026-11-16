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
  }
  let { id, title, unit, foot, tools, lead, footTable, table, children, grow = false, stickyHead = false }: Props = $props();

  const showTable = $derived(!!table && !!app.table[id]);
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
      {#if table}
        <div class="seg" role="group" aria-label="{title}">
          <button type="button" aria-pressed={!showTable} onclick={() => setTable(false)}>{L.t['plate.chart']}</button>
          <button type="button" aria-pressed={showTable} onclick={() => setTable(true)}>{L.t['plate.table']}</button>
        </div>
      {/if}
    </div>
  </header>
  {#if lead}<div class="lead">{@render lead()}</div>{/if}
  <div class="body">
    {#if showTable}
      <div class="table-wrap">{@render table!()}</div>
    {:else}
      {@render children()}
    {/if}
  </div>
  <footer class="foot">
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
  .titles { min-width: 0; flex: 1 1 340px; }
  h2 {
    margin: 0;
    font-size: var(--fs-xl);
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.005em;
    text-wrap: balance;
  }
  .unit {
    margin: 2px 0 0;
    font-size: var(--fs-sm);
    color: var(--ink-3);
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
  /* touch screens: comfortable targets for the plate's toggles */
  @media (pointer: coarse) {
    .seg button { min-height: 40px; padding: 6px 14px; }
  }
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

  .seg { display: inline-flex; border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; }
  .seg button {
    border: 0;
    background: transparent;
    padding: 3px 10px;
    font-size: var(--fs-sm);
    color: var(--ink-2);
    cursor: pointer;
    transition: background var(--t) var(--ease), color var(--t) var(--ease);
  }
  .seg button + button { border-left: 1px solid var(--rule); }
  .seg button:hover { background: var(--paper-2); color: var(--ink); }
  .seg button[aria-pressed='true'] { background: var(--petrol); color: var(--on-petrol); }
  .seg button:focus-visible { outline-offset: -2px; }

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
