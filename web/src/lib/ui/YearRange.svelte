<script lang="ts">
  import { L } from '../locale.svelte';

  interface Props {
    min: number;
    max: number;
    from: number;
    to: number;
    onchange: (from: number, to: number) => void;
  }
  let { min, max, from, to, onchange }: Props = $props();

  const pct = (v: number) => ((v - min) / (max - min)) * 100;
</script>

<div class="yr">
  <div class="values" aria-hidden="true">
    <span>{from}</span><span class="dash">–</span><span>{to}</span>
  </div>
  <div class="track">
    <div class="fill" style:left="{pct(from)}%" style:right="{100 - pct(to)}%"></div>
    <input
      type="range" {min} {max} step="1" value={from}
      aria-label={L.t['filters.from']}
      oninput={(e) => onchange(Math.min(+e.currentTarget.value, to), to)}
    />
    <input
      type="range" {min} {max} step="1" value={to}
      aria-label={L.t['filters.to']}
      oninput={(e) => onchange(from, Math.max(+e.currentTarget.value, from))}
    />
  </div>
  <div class="ends" aria-hidden="true"><span>{min}</span><span>{max}</span></div>
</div>

<style>
  .yr { padding: 2px 0; }
  .values {
    font-size: var(--fs-lg);
    font-weight: 600;
    color: var(--ink);
    margin-bottom: 6px;
  }
  .dash { margin: 0 4px; color: var(--ink-3); }
  .track { position: relative; height: 22px; }
  .track::before {
    content: '';
    position: absolute; left: 0; right: 0; top: 10px;
    height: 2px; background: var(--rule);
  }
  .fill { position: absolute; top: 10px; height: 2px; background: var(--petrol); }
  input {
    position: absolute; inset: 0;
    width: 100%; margin: 0;
    background: transparent;
    pointer-events: none;
    appearance: none;
    -webkit-appearance: none;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    pointer-events: auto;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: var(--paper);
    border: 2px solid var(--petrol);
    cursor: grab;
  }
  input::-moz-range-thumb {
    pointer-events: auto;
    width: 12px; height: 12px;
    border-radius: 50%;
    background: var(--paper);
    border: 2px solid var(--petrol);
    cursor: grab;
  }
  input::-moz-range-track { background: transparent; }
  input:focus-visible { outline: none; }
  input:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--petrol-tint); background: var(--petrol); }
  input:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px var(--petrol-tint); background: var(--petrol); }
  .ends {
    display: flex; justify-content: space-between;
    font-size: var(--fs-xs); color: var(--ink-3);
  }
</style>
