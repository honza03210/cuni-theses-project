<script lang="ts">
  import { gradesByFaculty, gradesByYear, sumCounts } from '../../lib/data/aggregate';
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
  import { gradeShift } from '../../lib/data/answers';
  import { aiFilterActive } from '../../lib/data/select';
  import AiCaveat, { aiWho } from '../../lib/ui/AiCaveat.svelte';

  interface Props { theses: Theses; mask: Uint8Array }
  let { theses, mask }: Props = $props();

  const meta = $derived(theses.meta);
  const byYear = $derived(gradesByYear(theses, mask, app.yearFrom, app.yearTo));
  const barYear = $derived(app.gradeYear !== null && app.gradeYear >= app.yearFrom && app.gradeYear <= app.yearTo
    ? app.gradeYear : app.yearTo);
  const facs = $derived([...app.fac].sort((a, b) => a - b));
  const byFac = $derived(gradesByFaculty(theses, mask, barYear, facs));
  const allRow = $derived({ fac: -1, counts: sumCounts(byFac), total: byFac.reduce((s, r) => s + r.total, 0) });
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
      <b>{L.t['ai.lede.grades'](aiWho(), gshift.postSpan, L.f.pct(gshift.pre[0]), L.f.pct(gshift.post[0]), L.f.pct(gshift.pre[1]), L.f.pct(gshift.post[1]))}</b>
      <span class="muted"> {L.t['ai.lede.note']}</span>
    {:else if gshift}
      <b>{gshift.same ? L.t['grades.verdict.same'] : L.t['grades.verdict.moved']}</b>
      {L.t['grades.lede'](L.f.pct(gshift.pre[0]), L.f.pct(gshift.post[0]), L.f.pct(gshift.pre[1]), L.f.pct(gshift.post[1]), gshift.postTo)}
    {:else}
      <span class="muted">{L.t['trends.lede.na']}</span>
    {/if}
  </Lede>
  {#if aiOn && gshift}<AiCaveat span={gshift.postSpan} />{/if}
  <div class="grades">
    <div class="area">
      <Plate id="g-area" title={L.t['grades.area.title']} unit={`${L.t['grades.area.unit']} · ${app.yearFrom}–${app.yearTo}`}
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
        <GradeArea rows={byYear} selected={barYear} yearMax={meta.yearMax} onselect={(y) => (app.gradeYear = y)} />
      </Plate>
    </div>
    <div class="bars">
      <Plate id="g-bars" title={L.t['grades.bars.title'](barYear)} unit={`${L.t['grades.bars.unit']} · ${L.t['grades.bars.sort']}`} foot={L.t['grades.bars.small']}>
        {#snippet table()}
          <table>
            <thead><tr><th>{L.t['common.faculty']}</th>{#each [1, 2, 3, 4] as g (g)}<th>{g}</th>{/each}<th>{L.t['common.n']}</th></tr></thead>
            <tbody>
              {#each [allRow, ...byFac] as r (r.fac)}
                <tr><td>{r.fac < 0 ? L.t['common.all'] : meta.faculties[r.fac].abbr}</td>{#each r.counts as c, i (i)}<td>{pct(c, r.total)}</td>{/each}<td class="muted">{L.f.int(r.total)}</td></tr>
              {/each}
            </tbody>
          </table>
        {/snippet}
        <GradeBars rows={byFac} all={allRow} faculties={meta.faculties} />
      </Plate>
    </div>
    <div class="par">
      <GradeDots {theses} {mask} keys={['mean_word_len', 'mean_sentence_len', 'std_sentence_len', 'mattr', 'repeated_trigram_ratio', 'long_word_ratio']} />
    </div>
    <div class="par">
      <ParallelPlot {theses} {mask} />
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
  .glegend { display: flex; flex-wrap: wrap; gap: 2px 14px; list-style: none; margin: 0 0 var(--s3); padding: 0; font-size: var(--fs-sm); color: var(--ink-2); }
  .glegend li { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .sw { width: 11px; height: 11px; border-radius: 1px; box-shadow: inset 0 0 0 1px var(--swatch-edge); }
  .sw.hatch { background-image: repeating-linear-gradient(135deg, rgb(255 255 255 / 0.55) 0 1.5px, transparent 1.5px 4px) !important; background-color: var(--grade-4); }
  @media (max-width: 1279px) {
    .grades { grid-template-columns: minmax(0, 1fr); }
  }
</style>
