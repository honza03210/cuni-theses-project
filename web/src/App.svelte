<script lang="ts">
  import { tick } from 'svelte';
  import { onMount } from 'svelte';
  import { loadTheses } from './lib/data/load';
  import { countMask, filterMask } from './lib/data/select';
  import type { Theses } from './lib/data/types';
  import { app, assign, domainOf } from './lib/state/app.svelte';
  import { decode, encode, type View } from './lib/state/url';
  import { L } from './lib/locale.svelte';
  import FilterPanel from './lib/ui/FilterPanel.svelte';
  import WordsView from './views/words/WordsView.svelte';
  import TrendsView from './views/trends/TrendsView.svelte';
  import GradesView from './views/grades/GradesView.svelte';

  let theses = $state.raw<Theses | null>(null);
  let error: string | null = $state(null);
  let drawerOpen = $state(false);
  let bandH = $state(58);
  let drawerBtn: HTMLButtonElement | undefined = $state();
  // focus returns to the Filters button once the page behind is no longer inert
  function closeDrawer() { drawerOpen = false; tick().then(() => drawerBtn?.focus()); }
  $effect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer(); };
    addEventListener('keydown', onKey);
    // move focus into the drawer
    queueMicrotask(() => document.querySelector<HTMLElement>('.drawer-close')?.focus());
    return () => removeEventListener('keydown', onKey);
  });

  // a drawer left open while the window widens past the breakpoint would leave the page inert
  $effect(() => {
    const wide = matchMedia('(min-width: 1024px)');
    const on = () => { if (wide.matches) drawerOpen = false; };
    wide.addEventListener('change', on);
    return () => wide.removeEventListener('change', on);
  });

  // Theme: follows the OS until the viewer picks one; the pick is remembered per browser.
  const THEME_KEY = 'cuni-theses-theme';
  const systemDark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  function storedTheme(): 'light' | 'dark' | null {
    try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; }
  }
  let picked = $state(storedTheme());
  let sysDark = $state(systemDark?.matches ?? false);
  const theme = $derived(picked ?? (sysDark ? 'dark' : 'light'));
  function setTheme(t: 'light' | 'dark') {
    picked = t;
    try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode: keep for this visit */ }
  }
  $effect(() => {
    if (picked) document.documentElement.dataset.theme = picked;
    else delete document.documentElement.dataset.theme;
  });
  onMount(() => {
    const f = (e: MediaQueryListEvent) => (sysDark = e.matches);
    systemDark?.addEventListener('change', f);
    return () => systemDark?.removeEventListener('change', f);
  });

  async function load() {
    error = null;
    try {
      const t = await loadTheses();
      const st = decode(location.search, domainOf(t));
      // no explicit language in the link: Czech and Slovak browsers get Czech
      if (!new URLSearchParams(location.search).has('l') && /^(cs|sk)\b/i.test(navigator.language ?? '')) st.locale = 'cs';
      assign(st);
      theses = t;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  onMount(() => {
    load();
    const onPop = () => { if (theses) assign(decode(location.search, domainOf(theses))); };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  });

  // URL <- state
  $effect(() => {
    if (!theses) return;
    const q = encode(app, domainOf(theses));
    const url = q ? `?${q}` : location.pathname;
    if (url !== location.search && !(q === '' && location.search === '')) history.replaceState(null, '', url);
  });
  $effect(() => { document.documentElement.lang = app.locale; document.title = L.t.title; });

  const filters = $derived({ fac: app.fac, yearFrom: app.yearFrom, yearTo: app.yearTo, langs: app.langs, ai: app.ai });
  const mask = $derived(theses ? filterMask(theses, filters) : null);
  const matched = $derived(mask ? countMask(mask) : 0);

  const views: View[] = ['words', 'trends', 'grades'];
  const tabIds = { words: 'tab-words', trends: 'tab-trends', grades: 'tab-grades' } as const;
  function onTabKey(e: KeyboardEvent) {
    const i = views.indexOf(app.view);
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % views.length;
    else if (e.key === 'ArrowLeft') j = (i + views.length - 1) % views.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = views.length - 1;
    if (j < 0) return;
    e.preventDefault();
    app.view = views[j];
    document.getElementById(tabIds[views[j]])?.focus();
  }
</script>

{#snippet prefsCtl()}
      <div class="theme" role="group" aria-label={L.t['theme.label']}>
    <button type="button" aria-pressed={theme === 'light'} title={L.t['theme.light']} onclick={() => setTheme('light')}>
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>
      <span class="sr-only">{L.t['theme.light']}</span>
    </button>
    <button type="button" aria-pressed={theme === 'dark'} title={L.t['theme.dark']} onclick={() => setTheme('dark')}>
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z"/></svg>
      <span class="sr-only">{L.t['theme.dark']}</span>
    </button>
  </div>
  <div class="locale" role="group" aria-label={L.t['lang.switch']}>
    <button type="button" lang="cs" aria-pressed={app.locale === 'cs'} onclick={() => (app.locale = 'cs')}>CS</button>
    <button type="button" lang="en" aria-pressed={app.locale === 'en'} onclick={() => (app.locale = 'en')}>EN</button>
  </div>
{/snippet}

<a class="skip" href="#view-panel">{L.t['common.skip']}</a>
<div class="shell" class:drawer-open={drawerOpen} style:--band-h="{bandH}px">
  <header class="band" bind:clientHeight={bandH} inert={drawerOpen}>
    <div class="brand">
      <h1>{L.t.title}</h1>
      <p>{L.t.subtitle}</p>
    </div>
    <div class="tabs" role="tablist" aria-label={L.t['view.label']} tabindex="-1" onkeydown={onTabKey}>
      {#each views as v (v)}
        <button
          id={tabIds[v]} role="tab" type="button"
          aria-selected={app.view === v} aria-controls="view-panel"
          tabindex={app.view === v ? 0 : -1}
          onclick={() => (app.view = v)}
        >{L.t[`view.${v}`]}</button>
      {/each}
    </div>
    <div class="right">
      <button type="button" class="drawer-btn" bind:this={drawerBtn} aria-expanded={drawerOpen} aria-controls="filters"
        onclick={() => (drawerOpen = !drawerOpen)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        {L.t['filters.open']}
      </button>
      <div class="prefs band-prefs">{@render prefsCtl()}</div>
    </div>
  </header>

  <aside id="filters" class="filters" aria-label={L.t['filters.title']}
    role={drawerOpen ? 'dialog' : undefined} aria-modal={drawerOpen ? 'true' : undefined}>
    <div class="drawer-head">
      <span class="drawer-title">{L.t['filters.title']}</span>
      <button type="button" class="drawer-close" onclick={closeDrawer}>{L.t['filters.done']}</button>
    </div>
    <div class="prefs drawer-prefs">{@render prefsCtl()}</div>
    {#if theses}
      <FilterPanel {theses} {matched} yearsLocked={app.view === 'words'}
        aiApplies={app.view === 'words' || app.yearTo >= theses.meta.aiYear} />
    {/if}
  </aside>
  {#if drawerOpen}
    <button type="button" class="scrim" aria-label={L.t['filters.close']} tabindex="-1" onclick={closeDrawer}></button>
  {/if}

  <main inert={drawerOpen}>
  <div id="view-panel" role="tabpanel" tabindex="-1" aria-labelledby={tabIds[app.view]}>
    {#if error}
      <div class="state">
        <p><strong>{L.t['common.loadError']}</strong></p>
        <p class="detail">{error}</p>
        <button type="button" class="retry" onclick={load}>{L.t['common.retry']}</button>
      </div>
    {:else if !theses || !mask}
      <div class="state loading" aria-busy="true">
        <div class="skel w60"></div><div class="skel block"></div><div class="skel w40"></div><div class="skel block short"></div>
        <span class="sr-only">{L.t['common.loading']}</span>
      </div>
    {:else if app.view === 'words'}
      <WordsView {theses} {filters} />
    {:else if app.view === 'trends'}
      <TrendsView {theses} {mask} />
    {:else}
      <GradesView {theses} {mask} />
    {/if}
  </div>
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 272px minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    grid-template-areas: 'band band' 'filters main';
    min-height: 100vh;
  }
  .band {
    grid-area: band;
    position: sticky; top: 0; z-index: 20;
    display: grid;
    grid-template-columns: minmax(272px, auto) 1fr auto;
    align-items: end;
    background: var(--petrol-deep);
    color: var(--band-ink);
    padding: 0 var(--s5) 0 0;
    border-bottom: 3px solid var(--band-edge);
  }
  .brand { padding: 12px var(--s4) 10px; white-space: nowrap; }
  h1 { margin: 0; font-size: var(--fs-lg); font-weight: 700; line-height: 1.2; letter-spacing: -0.005em; }
  .brand p { margin: 2px 0 0; font-size: var(--fs-xs); color: var(--band-ink-2); }

  .tabs { display: flex; gap: 2px; align-self: end; padding-left: var(--s5); }
  .tabs button {
    border: 0;
    background: transparent;
    color: var(--band-ink-2);
    font-size: var(--fs-md);
    font-weight: 600;
    padding: 10px 18px 9px;
    cursor: pointer;
    border-radius: 3px 3px 0 0;
    transition: background var(--t) var(--ease), color var(--t) var(--ease);
  }
  .tabs button:hover { color: var(--band-ink); background: var(--band-hover); }
  .tabs button[aria-selected='true'] { background: var(--paper); color: var(--ink); box-shadow: inset 0 3px 0 var(--petrol); }
  .tabs button:focus-visible { outline-color: var(--band-ink); outline-offset: -3px; }
  .tabs button[aria-selected='true']:focus-visible { outline-color: var(--petrol); }

  .right { display: flex; align-items: center; gap: var(--s3); align-self: center; }
  .locale, .theme { display: inline-flex; border: 1px solid var(--band-line); border-radius: 3px; overflow: hidden; }
  .locale button, .theme button {
    border: 0; background: transparent; color: var(--band-ink-2);
    font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.06em;
    padding: 4px 9px; cursor: pointer;
  }
  .locale button[aria-pressed='true'], .theme button[aria-pressed='true'] { background: var(--band-ink); color: var(--petrol-deep); }
  .locale button:focus-visible, .theme button:focus-visible { outline-color: var(--band-ink); }
  .locale button:not([aria-pressed='true']):hover, .theme button:not([aria-pressed='true']):hover { color: var(--band-ink); background: var(--band-hover); }
  .theme button { display: inline-flex; align-items: center; padding: 4px 8px; }
  .theme svg { display: block; }
  .drawer-btn {
    display: none;
    align-items: center; gap: 6px;
    border: 1px solid var(--band-line); border-radius: 3px;
    background: transparent; color: var(--band-ink);
    font-size: var(--fs-sm); padding: 4px 10px; cursor: pointer;
  }

  .filters {
    grid-area: filters;
    position: sticky;
    top: var(--band-h, 58px);
    align-self: start;
    height: calc(100vh - var(--band-h, 58px));
    overflow-y: auto;
    background: var(--paper-2);
    border-right: 1px solid var(--rule);
  }
  main {
    grid-area: main;
    min-width: 0;
    padding: var(--s5) var(--s6) var(--s7);
  }
  .state { max-width: 60ch; padding: var(--s6) 0; }
  .state .detail { color: var(--ink-3); font-size: var(--fs-sm); }
  .retry {
    border: 1px solid var(--ink); background: var(--ink); color: var(--paper);
    border-radius: 3px; padding: 6px 14px; cursor: pointer;
  }
  .loading { display: grid; gap: 14px; max-width: none; }
  .skel { height: 14px; background: var(--paper-2); border-radius: 2px; animation: pulse 1.4s ease-in-out infinite; }
  .skel.w60 { width: 60%; height: 20px; }
  .skel.w40 { width: 40%; height: 20px; margin-top: 18px; }
  .skel.block { height: 300px; }
  .skel.short { height: 180px; }
  @keyframes pulse { 50% { opacity: 0.55; } }
  .scrim { display: none; }
  .prefs { display: flex; align-items: center; gap: var(--s3); }
  .drawer-prefs { display: none; }
  .drawer-head { display: none; }
  #view-panel:focus { outline: none; }
  .skip {
    position: fixed; left: 12px; top: -60px; z-index: 100;
    background: var(--ink); color: var(--paper); padding: 8px 14px; border-radius: 3px;
    font-weight: 600; text-decoration: none; transition: top var(--t) var(--ease);
  }
  .skip:focus { top: 12px; }

  @media (max-width: 1023px) {
    .shell { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'band' 'main'; }
    .band { grid-template-columns: 1fr auto; padding-right: var(--s4); }
    .tabs { grid-column: 1 / -1; grid-row: 2; padding-left: var(--s4); overflow-x: auto; }
    .drawer-btn { display: inline-flex; }
    .filters {
      position: fixed; z-index: 40; left: 0; top: 0; bottom: 0;
      height: 100vh; width: min(320px, 88vw);
      transform: translateX(-100%);
      /* closed: hidden from tab order and screen readers once the slide-out ends */
      visibility: hidden;
      transition: transform 220ms var(--ease), visibility 0s linear 220ms, box-shadow 220ms var(--ease);
    }
    .drawer-open .filters {
      transform: none; visibility: visible;
      box-shadow: 4px 0 24px var(--shadow);
      transition: transform 220ms var(--ease), visibility 0s, box-shadow 220ms var(--ease);
    }
    .drawer-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: var(--s3) var(--s4); border-bottom: 1px solid var(--rule);
      position: sticky; top: 0; z-index: 2; background: var(--paper-2);
    }
    .drawer-title { font-weight: 700; font-size: var(--fs-lg); }
    .drawer-close {
      min-height: 40px; padding: 6px 16px; border-radius: 3px; cursor: pointer;
      border: 1px solid var(--ink); background: var(--ink); color: var(--paper); font-weight: 600;
    }
    .scrim { display: block; position: fixed; inset: 0; z-index: 30; border: 0; background: rgb(28 31 36 / 0.3); }
    main { padding: var(--s4) var(--s4) var(--s6); }
  }
  @media (max-width: 639px) {
    .band-prefs { display: none; }
    .brand { white-space: normal; }
    h1 { font-size: var(--fs-md); }
    /* in the drawer the switches sit on paper, not on the band */
    .drawer-prefs {
      display: flex; padding: var(--s3) var(--s4); border-bottom: 1px solid var(--rule);
      --band-line: var(--rule); --band-ink: var(--ink); --band-ink-2: var(--ink-2); --band-hover: var(--paper-3); --petrol-deep: var(--paper);
    }
    .drawer-prefs :global(button) { min-height: 40px; min-width: 44px; justify-content: center; }
  }
</style>
