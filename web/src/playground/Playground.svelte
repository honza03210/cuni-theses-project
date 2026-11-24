<script lang="ts">
  import { loadTheses } from '../lib/data/load';
  import { loadPlayground, type PlaygroundCols } from '../lib/data/playground';
  import type { Theses } from '../lib/data/types';
  import { app } from '../lib/state/app.svelte';
  import { L } from '../lib/locale.svelte';
  import EmDashPlate from './EmDashPlate.svelte';

  // a scratch page: its own small URL state (?l=cs|en), every chart in detailed mode
  const q = new URLSearchParams(location.search);
  app.detailed = true;
  app.locale = q.get('l') === 'cs' || (!q.has('l') && /^(cs|sk)\b/i.test(navigator.language ?? '')) ? 'cs' : 'en';

  let data = $state<{ t: Theses; p: PlaygroundCols } | null>(null);
  let error = $state(false);
  Promise.all([loadTheses(), loadPlayground(`${import.meta.env.BASE_URL}data/`)])
    .then(([t, p]) => {
      if (p.emDash.length !== t.n) throw new Error('playground.bin: row count mismatch');
      data = { t, p };
    })
    .catch((e) => { console.error(e); error = true; });

  $effect(() => {
    document.documentElement.lang = app.locale;
    document.title = `${L.t['play.title']} · ${L.t.title}`;
    const u = new URL(location.href);
    u.searchParams.set('l', app.locale);
    history.replaceState(null, '', u);
  });
</script>

<div class="page">
  <header class="top">
    <div>
      <a class="back" href="./?l={app.locale}">{L.t['play.back']}</a>
      <h1>{L.t['play.title']}</h1>
      <p class="lede">{L.t['play.lede']}</p>
    </div>
    <div class="locale" role="group" aria-label={L.t['lang.switch']}>
      <button type="button" lang="cs" aria-pressed={app.locale === 'cs'} onclick={() => (app.locale = 'cs')}>CS</button>
      <button type="button" lang="en" aria-pressed={app.locale === 'en'} onclick={() => (app.locale = 'en')}>EN</button>
    </div>
  </header>

  <main>
    {#if error}
      <p class="status">{L.t['play.error']}</p>
    {:else if !data}
      <p class="status" role="status">{L.t['play.loading']}</p>
    {:else}
      <EmDashPlate t={data.t} counts={data.p.emDash} />
    {/if}
  </main>
</div>

<style>
  .page { max-width: 1080px; margin: 0 auto; padding: var(--s5) var(--s4) var(--s7); }
  .top {
    display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s4);
    padding-bottom: var(--s4); margin-bottom: var(--s5); border-bottom: 1px solid var(--ink);
  }
  .back { font-size: var(--fs-sm); color: var(--ink-2); text-underline-offset: 3px; text-decoration-color: var(--rule); }
  .back:hover { color: var(--ink); text-decoration-color: var(--ink); }
  h1 { margin: var(--s2) 0 0; font-size: var(--fs-2xl); line-height: 1.2; font-weight: 700; }
  .lede { margin: var(--s1) 0 0; color: var(--ink-2); font-size: var(--fs-md); }
  .status { color: var(--ink-3); }
  .locale { display: inline-flex; border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; flex: none; }
  .locale button {
    border: 0; background: none; padding: 4px 10px; min-height: 32px; cursor: pointer;
    font: inherit; font-size: var(--fs-sm); font-weight: 600; color: var(--ink-2);
  }
  .locale button[aria-pressed='true'] { background: var(--petrol); color: var(--on-petrol); }
  .locale button:not([aria-pressed='true']):hover { background: var(--paper-3); color: var(--ink); }
  @media (pointer: coarse) { .locale button { min-height: 44px; min-width: 44px; } }
</style>
