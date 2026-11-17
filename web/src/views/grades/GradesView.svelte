<script lang="ts">
  import { gradesByFaculty, gradesByFacultyRange, gradesByYear, sumCounts, type GradeFac } from '../../lib/data/aggregate';
  import type { Theses } from '../../lib/data/types';
  import { app } from '../../lib/state/app.svelte';
  import { L } from '../../lib/locale.svelte';
  import { GRADE_VARS } from '../../lib/chart';
  import Plate from '../../lib/ui/Plate.svelte';
  import GradeArea from './GradeArea.svelte';
  import GradeBars from './GradeBars.svelte';
  import ParallelPlot from './ParallelPlot.svelte';
  import GradeDots from './GradeDots.svelte';
  import Lede from '../../lib/ui/Lede.svelte';
  import { gradeShift, PRE, POST_FROM } from '../../lib/data/answers';
  import { aiFilterActive } from '../../lib/data/select';
  import AiCaveat, { aiWho } from '../../lib/ui/AiCaveat.svelte';

  interface Props { theses: Theses; mask: Uint8Array }
  let { theses, mask }: Props = $props();

  const meta = $derived(theses.meta);
  const byYear = $derived(gradesByYear(theses, mask, app.yearFrom, app.yearTo));
  const barYear = $derived(app.gradeYear !== null && app.gradeYear >= app.yearFrom && app.gradeYear <= app.yearTo
    ? app.gradeYear : app.yearTo);
  const facs = $derived([...app.fac].sort((a, b) => a - b));
  // Bars: before vs after ChatGPT by default; clicking a year in the area chart switches to that year.
  const postTo = $derived(Math.min(app.yearTo, meta.yearMax - 1));
  const canCompare = $derived(app.yearFrom <= PRE[1] && postTo >= POST_FROM);
  const compare = $derived(canCompare && app.gradeYear === null);
  const preLabel = $derived(`${Math.max(PRE[0], app.yearFrom)}–${PRE[1]}`);
  const postLabel = $derived(postTo === POST_FROM ? `${POST_FROM}` : `${POST_FROM}–${postTo}`);
  const byFac = $derived(compare
    ? gradesByFacultyRange(theses, mask, POST_FROM, postTo, facs)
    : gradesByFaculty(theses, mask, barYear, facs));
  const prevFac = $derived(compare ? gradesByFacultyRange(theses, mask, PRE[0], PRE[1], facs) : null);
  const total = (rows: GradeFac[]): GradeFac => ({ fac: -1, counts: sumCounts(rows), total: rows.reduce((s, r) => s + r.total, 0) });
  const allRow = $derived(total(byFac));
  const prevAll = $derived(prevFac ? total(prevFac) : null);
  const hasData = $derived(byYear.some((r) => r.total > 0));
  const pct = (c: number, t: number) => (t ? L.f.pct(c / t) : '–');
  const aiOn = $derived(aiFilterActive(app.ai) && app.yearTo >= meta.aiYear);
  const gshift = $derived(gradeShift(theses, mask, Math.min(app.yearTo, meta.yearMax - 1)));
</script>

{#snippet gradeLegend()}
  <ul class="glegend">
    {#each [1, 2, 3, 4] as g (g)}
      <li><span class="sw" class:hatch={g === 4} style:background={GRADE_VARS[g - 1]}></span>{g} {L.t[`grade.${g}` as 'grade.1']}</li>
    {/each}
  </ul>
{/snippet}

{#if !hasData}
  <p class="empty">{L.t['common.empty']} <button type="button" class="fix" onclick={() => (app.fac = meta.faculties.map((_, i) => i))}>{L.t['common.selectAll']}</button></p>
{:else}
  <Lede howto={L.t['grades.howto']}>
    {#if gshift && aiOn}
      <span class="lead-note">{L.t['ai.lede.note']}</span>
      <b>{L.t['ai.lede.grades'](aiWho(), gshift.postSpan, L.f.pct(gshift.pre[0]), L.f.pct(gshift.post[0]), L.f.pct(gshift.pre[1]), L.f.pct(gshift.post[1]))}</b>
    {:else if gshift}
      <b>{gshift.same ? L.t['grades.verdict.same'] : gshift.clear ? L.t['grades.verdict.moved'] : L.t['grades.verdict.unclear']}</b>
      {L.t['grades.lede'](L.f.pct(gshift.pre[0]), L.f.pct(gshift.post[0]), L.f.pct(gshift.pre[1]), L.f.pct(gshift.post[1]), gshift.postTo)}
    {:else}
      <span class="muted">{L.t['trends.lede.na']}</span>
    {/if}
  </Lede>
  {#if aiOn && gshift}<AiCaveat span={gshift.postSpan} />{/if}
  <div class="grades">
    <div class="area">
      <Plate id="g-area" grow title={L.t['grades.area.title']} unit={`${L.t['grades.area.unit']} · ${app.yearFrom}–${app.yearTo}`}
        foot={`${L.t['grades.area.hint']} ${L.t['grades.foot']}`}>
        {#snippet table()}
          <table>
            <thead><tr><th>{L.t['common.year']}</th>{#each [1, 2, 3, 4] as g (g)}<th>{g}</th>{/each}<th>{L.t['common.n']}</th></tr></thead>
            <tbody>
              {#each byYear as r (r.year)}
                <tr><td>{r.year}</td>{#each r.counts as c, i (i)}<td>{pct(c, r.total)}</td>{/each}<td class="muted">{L.f.int(r.total)}</td></tr>
              {/each}
            </tbody>
          </table>
        {/snippet}
        {@render gradeLegend()}
        <GradeArea rows={byYear} selected={barYear} marked={!compare} aiYear={aiOn ? meta.aiYear : null} fill yearMax={meta.yearMax} onselect={(y) => (app.gradeYear = y)} />
      </Plate>
    </div>
    <div class="bars">
      <Plate id="g-bars" title={compare ? L.t['grades.bars.titleCmp'](preLabel, postLabel) : L.t['grades.bars.title'](barYear)} unit={`${L.t['grades.bars.unit']} · ${L.t['grades.bars.sort']}`} foot={L.t['grades.bars.small']}>
        {#snippet tools()}
          {#if canCompare}
            <div class="seg" role="group" aria-label={L.t['grades.bars.mode']}>
              <button type="button" aria-pressed={compare} onclick={() => (app.gradeYear = null)}>{L.t['grades.bars.cmp']}</button>
              <button type="button" aria-pressed={!compare} onclick={() => (app.gradeYear = barYear)}>{L.t['grades.bars.year'](barYear)}</button>
            </div>
          {/if}
        {/snippet}
        {#snippet table()}
          <table>
            <thead><tr><th>{L.t['common.faculty']}</th>{#if compare}<th>{L.t['common.year']}</th>{/if}{#each [1, 2, 3, 4] as g (g)}<th>{g}</th>{/each}<th>{L.t['common.n']}</th></tr></thead>
            <tbody>
              {#each [allRow, ...byFac] as r (r.fac)}
                {@const p = compare ? (r.fac < 0 ? prevAll : prevFac?.find((x) => x.fac === r.fac)) : null}
                {#if p}
                  <tr><td>{r.fac < 0 ? L.t['common.all'] : meta.faculties[r.fac].abbr}</td><td class="muted">{preLabel}</td>{#each p.counts as c, i (i)}<td>{pct(c, p.total)}</td>{/each}<td class="muted">{L.f.int(p.total)}</td></tr>
                {/if}
                <tr><td>{p ? '' : r.fac < 0 ? L.t['common.all'] : meta.faculties[r.fac].abbr}</td>{#if compare}<td class="muted">{postLabel}</td>{/if}{#each r.counts as c, i (i)}<td>{pct(c, r.total)}</td>{/each}<td class="muted">{L.f.int(r.total)}</td></tr>
              {/each}
            </tbody>
          </table>
        {/snippet}
        <GradeBars rows={byFac} all={allRow} faculties={meta.faculties} prev={prevFac} prevAll={prevAll} tags={[preLabel, postLabel]} />
      </Plate>
    </div>
    <div class="par">
      <ParallelPlot {theses} {mask} />
    </div>
    <div class="par">
      <GradeDots {theses} {mask} keys={['mean_word_len', 'std_sentence_len', 'mean_sentence_len', 'mattr', 'repeated_trigram_ratio', 'long_word_ratio']} />
    </div>
  </div>
{/if}

<style>
  .grades {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: var(--s6) var(--s6);
  }
  .area, .bars { display: flex; min-width: 0; }
  .area > :global(.plate), .bars > :global(.plate) { flex: 1 1 auto; }
  .par { grid-column: 1 / -1; min-width: 0; }
  .empty { color: var(--ink-2); padding: var(--s6) 0; }
  .fix { margin-left: 6px; border: 1px solid var(--ink-3); background: var(--paper); color: var(--ink); border-radius: 3px; padding: 3px 10px; font-size: var(--fs-sm); cursor: pointer; }
  .seg { display: inline-flex; border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; }
  .seg button { border: 0; background: transparent; padding: 3px 10px; font-size: var(--fs-sm); cursor: pointer; color: var(--ink-2); }
  .seg button + button { border-left: 1px solid var(--rule); }
  .seg button[aria-pressed='true'] { background: var(--petrol); color: var(--on-petrol); }
  @media (pointer: coarse) { .seg button { min-height: 40px; } }
  .glegend { display: flex; flex-wrap: wrap; gap: 2px 14px; list-style: none; margin: 0 0 var(--s3); padding: 0; font-size: var(--fs-sm); color: var(--ink-2); }
  .glegend li { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .sw { width: 11px; height: 11px; border-radius: 1px; box-shadow: inset 0 0 0 1px var(--swatch-edge); }
  .sw.hatch { background-image: repeating-linear-gradient(135deg, rgb(255 255 255 / 0.55) 0 1.5px, transparent 1.5px 4px) !important; background-color: var(--grade-4); }
  @media (max-width: 1279px) {
    .grades { grid-template-columns: minmax(0, 1fr); }
  }
</style>
