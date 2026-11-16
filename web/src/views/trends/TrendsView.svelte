<script lang="ts">
  import { metricSeries } from '../../lib/data/aggregate';
  import { aiFilterActive, filterMask } from '../../lib/data/select';
  import type { Theses } from '../../lib/data/types';
  import { padDomain } from '../../lib/chart';
  import { app } from '../../lib/state/app.svelte';
  import { L } from '../../lib/locale.svelte';
  import Plate from '../../lib/ui/Plate.svelte';
  import TrendPanel from './TrendPanel.svelte';

  interface Props { theses: Theses; mask: Uint8Array }
  let { theses, mask }: Props = $props();

  const meta = $derived(theses.meta);
  const metric = $derived(meta.metrics.find((m) => m.key === app.metric) ?? meta.metrics[0]);
  const facs = $derived([...app.fac].sort((a, b) => a - b));
  const series = $derived(metricSeries(theses, mask, metric.key, facs, app.yearFrom, app.yearTo));

  // With a single faculty, compare against the whole university under the same other filters
  const uniRef = $derived.by(() => {
    if (facs.length !== 1) return null;
    const all = meta.faculties.map((_, i) => i);
    const m = filterMask(theses, { fac: all, yearFrom: app.yearFrom, yearTo: app.yearTo, langs: app.langs, ai: app.ai });
    return metricSeries(theses, m, metric.key, all, app.yearFrom, app.yearTo).overall;
  });

  const yDomain = $derived.by((): [number, number] => {
    let lo = Infinity, hi = -Infinity;
    for (const pts of series.byFac.values()) for (const p of pts) { lo = Math.min(lo, p.mean); hi = Math.max(hi, p.mean); }
    for (const p of series.overall) { lo = Math.min(lo, p.mean); hi = Math.max(hi, p.mean); }
    for (const p of uniRef ?? []) { lo = Math.min(lo, p.mean); hi = Math.max(hi, p.mean); }
    return padDomain(lo, hi, 0.08);
  });

  const aiOn = $derived(aiFilterActive(app.ai) && app.yearTo >= meta.aiYear);
  const mixedLang = $derived(app.langs.length > 1);
  const hasData = $derived(series.overall.length > 0);
  const fmtV = (v: number) => L.f.num(v, metric.decimals);
  const tableYears = $derived(Array.from({ length: app.yearTo - app.yearFrom + 1 }, (_, i) => app.yearFrom + i));
  const byYear = (pts: { year: number; mean: number; n: number }[] | undefined, y: number) => pts?.find((p) => p.year === y);
</script>

<div class="trends">
  <div class="main">
    <Plate id="trends" title={L.t['trends.title'](L.pick(metric.label))} unit={`${L.pick(metric.unit)} · ${app.yearFrom}–${app.yearTo}`} foot={L.t['trends.foot']}>
      {#snippet tools()}
        <ul class="legend" aria-label="Legend">
          <li><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--ink)" stroke-width="2.25"/></svg>{L.t['trends.this']}</li>
          {#if facs.length === 1}
            <li><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--avg)" stroke-width="2.25" stroke-dasharray="5 3"/></svg>{L.t['trends.uni']}</li>
          {:else}
            <li><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--context)" stroke-width="1.25"/></svg>{L.t['trends.other']}</li>
            <li><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" stroke="var(--avg)" stroke-width="2.25" stroke-dasharray="5 3"/></svg>{L.t['trends.avg']}</li>
          {/if}
        </ul>
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
      {#if !facs.length || !hasData}
        <p class="empty">{L.t['common.empty']}</p>
      {:else}
        <div class="grid" class:single={facs.length === 1}>
          {#each facs as f, fi (f)}
            <TrendPanel first={fi === 0}
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
      {#each meta.metrics as m (m.key)}
        <label class:active={m.key === metric.key}>
          <input type="radio" name="metric" value={m.key} checked={m.key === metric.key} onchange={() => (app.metric = m.key)} />
          <span class="ml">{L.pick(m.label)}</span>
          <span class="md">{L.pick(m.desc)}</span>
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
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--s5) var(--s4);
  }
  .grid.single { grid-template-columns: minmax(0, 1fr); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; list-style: none; margin: 0; padding: 0; font-size: var(--fs-sm); color: var(--ink-2); }
  .legend li { display: inline-flex; align-items: center; gap: 6px; }
  .warn { margin: 0 0 var(--s3); font-size: var(--fs-sm); color: var(--warn); font-weight: 600; }
  .empty { color: var(--ink-2); padding: var(--s6) 0; }

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
  label {
    clear: both;
    display: grid;
    grid-template-columns: 18px 1fr;
    column-gap: 6px;
    padding: 7px 8px 7px 6px;
    border-top: 1px solid var(--rule-soft);
    cursor: pointer;
    transition: background var(--t) var(--ease);
  }
  label:hover { background: var(--paper-2); }
  label.active { background: var(--petrol-tint); }
  input { margin: 3px 0 0; grid-row: span 2; }
  .ml { font-size: var(--fs-md); font-weight: 600; line-height: 1.3; }
  .md { font-size: var(--fs-xs); color: var(--ink-3); line-height: 1.4; }
  label.active .md { color: var(--ink-2); }

  @media (max-width: 1279px) {
    .trends { grid-template-columns: minmax(0, 1fr); }
    .picker { position: static; order: -1; }
    fieldset { display: flex; flex-wrap: wrap; gap: 0 4px; }
    label { clear: none; grid-template-columns: 18px auto; border: 1px solid var(--rule-soft); border-radius: 3px; margin: 0 0 4px; padding: 4px 10px 4px 6px; }
    .md { display: none; }
    input { grid-row: auto; }
  }
</style>
