<script lang="ts">
  import { tick } from 'svelte';
  import { metricSeries } from '../../lib/data/aggregate';
  import { aiFilterActive, filterMask } from '../../lib/data/select';
  import type { Theses } from '../../lib/data/types';
  import { padDomain } from '../../lib/chart';
  import { app } from '../../lib/state/app.svelte';
  import { L } from '../../lib/locale.svelte';
  import Plate from '../../lib/ui/Plate.svelte';
  import TrendPanel from './TrendPanel.svelte';
  import Lede from '../../lib/ui/Lede.svelte';
  import { yearsLabel } from '../../lib/state/zoom.svelte';
  import EmptyNote from '../../lib/ui/EmptyNote.svelte';
  import { magnitude, metricShift } from '../../lib/data/answers';
  import { aiWho } from '../../lib/ui/AiCaveat.svelte';

  interface Props { theses: Theses; mask: Uint8Array }
  let { theses, mask }: Props = $props();

  const meta = $derived(theses.meta);
  // measures exported for the Grades view only are not offered here
  const trendMetrics = $derived(meta.metrics.filter((m) => m.trend !== false));
  const metric = $derived(trendMetrics.find((m) => m.key === app.metric) ?? trendMetrics[0]);
  let showOthers = $state(true);
  let gridW = $state(900);
  let grid: HTMLElement | undefined = $state();
  // one Tab stop for the whole grid; arrow keys move between panels
  let activePanel = $state(0);
  async function nav(fi: number, key: string) {
    const n = shown.length;
    activePanel = key === 'Home' ? 0 : key === 'End' ? n - 1
      : Math.max(0, Math.min(n - 1, fi + (key === 'ArrowDown' ? 1 : -1)));
    await tick();
    grid?.querySelectorAll<SVGElement>('svg[role="slider"]')[activePanel]?.focus();
  }
  // phones get two narrower columns, so 15 faculties are not a 15-screen scroll
  const colMin = $derived(gridW < 600 ? 150 : 220);
  const series = $derived(metricSeries(theses, mask, metric.key, [...app.fac].sort((a, b) => a - b), app.yearFrom, app.yearTo));
  /** change after ChatGPT per faculty: mean of 2023+ points minus mean of 2018–2022 points */
  const change = (f: number) => {
    const pts = series.byFac.get(f) ?? [];
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
    return avg(pts.filter((p) => p.year >= 2023 && p.year < meta.yearMax).map((p) => p.mean))
      - avg(pts.filter((p) => p.year >= 2018 && p.year <= 2022).map((p) => p.mean));
  };
  // panels ordered by change after 2022 (largest rise first); faculties without both windows last
  const facs = $derived([...app.fac].sort((a, b) => {
    const ca = change(a), cb = change(b);
    if (Number.isNaN(ca) !== Number.isNaN(cb)) return Number.isNaN(ca) ? 1 : -1;
    return Number.isNaN(ca) ? a - b : cb - ca;
  }));

  // With a single faculty, compare against the whole university under the same other filters
  const uniAll = $derived.by(() => {
    if (facs.length !== 1) return null;
    const all = meta.faculties.map((_, i) => i);
    const m = filterMask(theses, { fac: all, yearFrom: app.yearFrom, yearTo: app.yearTo, langs: app.langs, ai: app.ai, genders: app.genders, grades: app.grades });
    return metricSeries(theses, m, metric.key, all, app.yearFrom, app.yearTo);
  });
  const uniRef = $derived(uniAll?.overall ?? null);

  const yDomain = $derived.by((): [number, number] => {
    let lo = Infinity, hi = -Infinity;
    for (const pts of series.byFac.values()) for (const p of pts) { lo = Math.min(lo, p.mean); hi = Math.max(hi, p.mean); }
    for (const p of series.overall) { lo = Math.min(lo, p.mean); hi = Math.max(hi, p.mean); }
    for (const p of uniRef ?? []) { lo = Math.min(lo, p.mean); hi = Math.max(hi, p.mean); }
    // one faculty: keep the scale of the all-faculty small multiples, so its change is not magnified
    if (uniAll) for (const pts of uniAll.byFac.values()) for (const p of pts) { lo = Math.min(lo, p.mean); hi = Math.max(hi, p.mean); }
    const [a, b] = padDomain(lo, hi, 0.08);
    // every measure is a count, share or length: a domain padded below 0 would draw impossible values
    return [lo >= 0 ? Math.max(0, a) : a, b];
  });

  const aiOn = $derived(aiFilterActive(app.ai) && app.yearTo >= meta.aiYear);
  // In AI mode, faculties without any drawable point from 2023 on are listed in one line instead of an empty panel.
  const noPost = $derived(aiOn ? facs.filter((f) => !(series.byFac.get(f) ?? []).some((p) => p.year >= meta.aiYear)) : []);
  const shown = $derived(noPost.length ? facs.filter((f) => !noPost.includes(f)) : facs);
  const mixedLang = $derived(app.langs.length > 1);
  const hasData = $derived(series.overall.length > 0);
  const fmtV = (v: number) => L.f.num(v, metric.decimals);
  const shift = $derived(metricShift(theses, mask, metric.key, Math.min(app.yearTo, meta.yearMax - 1)));
  const phrase = $derived.by(() => {
    if (!shift) return '';
    const m = magnitude(shift.d);
    if (m !== 'none' && !shift.clear) return L.t['mag.unclear'];
    return m === 'none' ? L.t['mag.none'] : L.t[`mag.${m}.${shift.post >= shift.pre ? 'up' : 'down'}` as 'mag.slight.up'];
  });
  /** change as text: percentage points for share measures (already in %), relative % otherwise */
  const relText = (sh: { pre: number; post: number; rel: number }) => L.pick(metric.unit).startsWith('%')
    ? L.t['words.pp'](L.f.signed(sh.post - sh.pre, 1))
    : L.f.pct(sh.rel, 1).replace(/^(?=\d)/, '+');
  const tableYears = $derived(Array.from({ length: app.yearTo - app.yearFrom + 1 }, (_, i) => app.yearFrom + i));
  const byYear = (pts: { year: number; mean: number; n: number }[] | undefined, y: number) => pts?.find((p) => p.year === y);
</script>

{#snippet legend()}
        <ul class="legend" aria-label={L.t['common.legend']}>
          <li><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--ink)" stroke-width="2.25"/></svg>{L.t['trends.this']}</li>
          <li><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--ink)" stroke-width="5" stroke-opacity="0.55"/></svg>{L.t['trends.levels']}</li>
          <li><svg width="22" height="10" aria-hidden="true"><rect x="0" y="0" width="22" height="10" fill="var(--ink)" fill-opacity="0.08"/></svg>{L.t['trends.band']}</li>
          {#if facs.length === 1}
            <li><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--avg)" stroke-width="2.25" stroke-dasharray="5 3"/></svg>{L.t['trends.uni']}</li>
          {:else}
            <li class="full-only"><label class="others"><input type="checkbox" bind:checked={showOthers} /><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--context)" stroke-width="1.25"/></svg>{L.t['trends.other']}</label></li>
            <li><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--avg)" stroke-width="2.25" stroke-dasharray="5 3"/></svg>{L.t['trends.avg']}</li>
          {/if}
        </ul>
{/snippet}

<div class="trends">
  <div class="main">
    <Lede howto={`${L.t['trends.howto']} ${L.t['zoom.how']}`}>
      {#if !hasData}
        <EmptyNote {theses} />
      {:else if shift && aiOn}
        <span class="lead-note">{L.t['ai.lede.note']}</span>
        <b>{L.t['ai.lede.trends'](aiWho(), shift.postSpan, L.pick(metric.label), fmtV(shift.pre), fmtV(shift.post), L.pick(metric.unit))}</b><span class="muted">{L.t['ai.lede.chance'](shift.clear)}</span>
      {:else if shift}
        <b>{L.t['trends.lede'](L.pick(metric.label), phrase)}</b>{L.t['trends.lede.vals'](fmtV(shift.pre), fmtV(shift.post), L.pick(metric.unit), shift.postTo)}
        <span class="muted full-only">{L.t['trends.lede.rel'](relText(shift))}</span>
        {#if shift.facCompared > 1}
          {@const up = shift.post >= shift.pre}
          <span class="muted full-only"> {L.t['trends.lede.facsSig'](up ? shift.facSigUp : shift.facSigDown, up ? shift.facSigDown : shift.facSigUp, shift.facCompared, up)}</span>
        {/if}
        {#if shift.step}<span class="when full-only">{L.t['trends.lede.step'](shift.step.lateYear, shift.step.earlySpan, fmtV(shift.step.early), fmtV(shift.step.late))}</span>{/if}
      {:else}
        <span class="muted">{L.t['trends.lede.na']}</span>
      {/if}
    </Lede>
    <label class="msel">
      <span>{L.t['trends.metric']}</span>
      <select value={metric.key} onchange={(e) => (app.metric = e.currentTarget.value)}>
        {#each trendMetrics as m (m.key)}<option value={m.key}>{L.pick(m.label)}</option>{/each}
      </select>
    </label>
    <Plate id="trends" stickyHead title={facs.length === 1 ? L.t['trends.titleOne'](L.pick(metric.label), meta.faculties[facs[0]].abbr) : L.t['trends.title'](L.pick(metric.label))} unit={`${L.pick(metric.unit)} · ${yearsLabel(app.yearFrom, app.yearTo)}${facs.length > 1 ? ` · ${app.yearTo >= 2023 ? L.t['trends.sorted'] : L.t['trends.sortedNone']}` : ''}`} foot={L.t['trends.foot']}>
      {#snippet tools()}
        <div class="legend-head">{@render legend()}</div>
      {/snippet}
      {#snippet table()}
        <table>
          <thead><tr><th>{L.t['common.year']}</th>{#each facs as f (f)}<th>{meta.faculties[f].abbr}</th>{/each}<th>{L.t['trends.avg']}</th></tr></thead>
          <tbody>
            {#each tableYears as y (y)}
              <tr>
                <td>{y}</td>
                {#each facs as f (f)}
                  {@const p = byYear(series.byFac.get(f), y)}
                  <td class:muted={!p}>{p ? fmtV(p.mean) : '–'}</td>
                {/each}
                <td><b>{byYear(series.overall, y) ? fmtV(byYear(series.overall, y)!.mean) : '–'}</b></td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/snippet}

      {#if mixedLang}<p class="warn" role="status">{L.t['trends.mixedLang']}</p>{/if}
      {#if noPost.length}<p class="nopost">{L.t['trends.noPost'](noPost.map((f) => meta.faculties[f].abbr).join(', '))}</p>{/if}
      {#if facs.length && hasData}
        <div class="grid" class:single={facs.length === 1} bind:this={grid} bind:clientWidth={gridW} style:--col-min="{colMin}px">
          {#each shown as f, fi (f)}
            <TrendPanel first={fi === 0} tabStop={fi === Math.min(activePanel, shown.length - 1)} onnav={(k) => nav(fi, k)} showOthers={showOthers && app.detailed}
              fac={f} faculty={meta.faculties[f]} {series} {facs} {yDomain} {metric} {aiOn}
              yearFrom={app.yearFrom} yearTo={app.yearTo} yearMax={meta.yearMax} aiYear={meta.aiYear}
              faculties={meta.faculties} uniRef={uniRef} large={facs.length === 1}
            />
          {/each}
        </div>
      {/if}
    </Plate>
  </div>

  <nav class="picker" aria-labelledby="metric-legend">
    <fieldset>
      <legend id="metric-legend">{L.t['trends.metric']}</legend>
      {#each trendMetrics as m (m.key)}
        <label class:active={m.key === metric.key}>
          <input type="radio" name="metric" value={m.key} checked={m.key === metric.key} onchange={() => (app.metric = m.key)} />
          <span class="ml">{L.pick(m.label)}</span>
          <span class="md full-only">{L.pick(m.desc)}</span>
        </label>
      {/each}
    </fieldset>
  </nav>
</div>

<style>
  .trends {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 232px;
    gap: var(--s6);
    align-items: start;
  }
  @media (max-width: 639px) { .trends .grid { gap: var(--s4) var(--s3); } }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--col-min, 220px), 1fr));
    gap: var(--s5) var(--s4);
  }
  .grid.single { grid-template-columns: minmax(0, 1fr); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; list-style: none; margin: 0; padding: 0; font-size: var(--fs-sm); color: var(--ink-2); }
  .legend li { display: inline-flex; align-items: center; gap: 6px; }
  .others { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  /* a default legend state, not a choice: ink, not petrol */
  .others input { margin: 0; accent-color: var(--ink-2); }
  .when { display: block; margin-top: 6px; font-size: var(--fs-md); color: var(--ink-2); }
  .nopost { margin: 0 0 var(--s3); font-size: var(--fs-sm); color: var(--ink-2); }
  .msel { display: none; }
  @media (max-width: 639px) {
    .msel { display: flex; flex-direction: column; gap: 4px; margin: 0 0 var(--s4);
      position: sticky; top: var(--band-h, 58px); z-index: 6; background: var(--paper); padding: 8px 0; font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-2); }
    .msel select { font: inherit; text-transform: none; letter-spacing: 0; font-size: var(--fs-md); font-weight: 600; color: var(--ink); background: var(--paper); border: 1px solid var(--ink-3); border-radius: 3px; padding: 9px 10px; min-height: 44px; }
    .picker { display: none; }
  }
  .warn { margin: 0 0 var(--s3); font-size: var(--fs-sm); color: var(--warn); font-weight: 600; }

  .picker { position: sticky; top: calc(var(--band-h, 58px) + var(--s5)); }
  fieldset { border: 0; margin: 0; padding: 0; }
  legend {
    float: left; width: 100%;
    padding: 12px 10px 10px;
    background: var(--plate-head);
    border-bottom: 1px solid var(--rule);
    border-radius: 4px 4px 0 0;
    font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-2);
  }
  .picker label {
    clear: both;
    display: grid;
    grid-template-columns: 18px 1fr;
    column-gap: 6px;
    padding: 7px 8px 7px 6px;
    border-top: 1px solid var(--rule-soft);
    cursor: pointer;
    transition: background var(--t) var(--ease);
  }
  .picker label:hover { background: var(--paper-2); }
  .picker label.active { background: var(--petrol-tint); }
  .picker input { margin: 3px 0 0; grid-row: span 2; }
  .ml { font-size: var(--fs-md); font-weight: 600; line-height: 1.3; }
  .md { font-size: var(--fs-xs); color: var(--ink-3); line-height: 1.4; }
  .picker label.active .md { color: var(--ink-2); }
  /* simple version: a plain list of measures, no tinted header */
  :global(.simple) .picker legend { background: none; padding: 0 0 8px; border-radius: 0; }

  @media (max-width: 1279px) {
    .trends { grid-template-columns: minmax(0, 1fr); }
    .picker { position: static; order: -1; }
    fieldset { display: flex; flex-wrap: wrap; gap: 0 4px; }
    .picker label { clear: none; grid-template-columns: 18px auto; border: 1px solid var(--rule-soft); border-radius: 3px; margin: 0 0 4px; padding: 4px 10px 4px 6px; }
    .md { display: none; }
    .picker input { grid-row: auto; }
  }
</style>
