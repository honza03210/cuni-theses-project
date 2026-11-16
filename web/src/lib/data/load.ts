import type { Theses, ThesesMeta, WordCube, WordsMeta } from './types';

const BASE = `${import.meta.env.BASE_URL}data/`;

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

/** Fetch a .gz file and return its decompressed bytes. Works whether or not the
 *  server already decoded it (some servers send .gz with Content-Encoding). */
async function fetchGz(url: string): Promise<ArrayBuffer> {
  const buf = await (await fetchOk(url)).arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function loadTheses(): Promise<Theses> {
  const [meta, buf] = await Promise.all([
    fetchOk(`${BASE}theses.json`).then((r) => r.json() as Promise<ThesesMeta>),
    fetchGz(`${BASE}theses.bin.gz`),
  ]);
  const n = meta.rows;
  const col = (name: string) => {
    const c = meta.columns.find((x) => x.name === name);
    if (!c) throw new Error(`missing column ${name}`);
    return c;
  };
  const u8 = (name: string) => new Uint8Array(buf, col(name).offset, n);
  const metrics: Record<string, Float32Array> = {};
  for (const m of meta.metrics) metrics[m.key] = new Float32Array(buf, col(m.key).offset, n);
  return {
    meta, n,
    fac: u8('fac'), year: u8('year'), lang: u8('lang'), ai: u8('ai'),
    grade: u8('grade'), usable: u8('usable'), clean: u8('clean'),
    metrics,
  };
}

const cubeCache = new Map<string, Promise<WordCube>>();

export function loadWordCube(lang: string, langIndex: number): Promise<WordCube> {
  let p = cubeCache.get(lang);
  if (!p) {
    p = (async () => {
      const [meta, buf] = await Promise.all([
        fetchOk(`${BASE}words-${lang}.json`).then((r) => r.json() as Promise<WordsMeta>),
        fetchGz(`${BASE}words-${lang}.bin.gz`),
      ]);
      const counts = new Uint16Array(buf);
      if (counts.length !== meta.words.length * meta.cells) throw new Error(`words-${lang}: size mismatch`);
      return { meta, langIndex, counts, index: new Map(meta.words.map((w, i) => [w, i])) };
    })();
    p.catch(() => cubeCache.delete(lang));
    cubeCache.set(lang, p);
  }
  return p;
}
