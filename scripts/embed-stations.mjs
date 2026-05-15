// Run locally to (re)generate station embeddings used by the "vibe search"
// feature. Output goes into /public so the deployed site can serve it
// statically with strong caching.
//
//   node scripts/embed-stations.mjs
//
// We pull the same Radio Browser feed as the runtime, then mean-pool a
// MiniLM-L6-v2 embedding over each station's name + country + tags. The
// result is a Float32 binary keyed by station UUID. Quantization could
// halve the size; for now plain float32 keeps the loader code trivial.

import { pipeline } from "@huggingface/transformers";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
];

const TOP_N = 1500;
const BATCH = 32;
const OUT_DIR = path.resolve(process.cwd(), "public");

async function fetchStations() {
  const params = new URLSearchParams({
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
    limit: String(TOP_N),
  });
  let lastErr;
  for (const base of MIRRORS) {
    try {
      const resp = await fetch(`${base}/json/stations/search?${params}`);
      if (resp.ok) return await resp.json();
      lastErr = new Error(`${resp.status} ${resp.statusText}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("all mirrors failed");
}

function docText(s) {
  const tags = (s.tags || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12).join(", ");
  return [
    s.name?.trim() || "",
    s.country || "",
    tags,
  ].filter(Boolean).join(". ");
}

async function main() {
  console.log("fetching stations...");
  const stations = await fetchStations();
  console.log(`got ${stations.length} stations`);

  console.log("loading model (this can take a minute the first time)...");
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  const uuids = [];
  const vectors = new Float32Array(stations.length * 384);
  let offset = 0;

  for (let i = 0; i < stations.length; i += BATCH) {
    const batch = stations.slice(i, i + BATCH);
    const texts = batch.map(docText);
    const out = await extractor(texts, { pooling: "mean", normalize: true });
    // out.data is a flat Float32Array of length (batchSize * 384).
    vectors.set(out.data, offset);
    offset += out.data.length;
    for (const s of batch) uuids.push(s.stationuuid);
    process.stdout.write(`\rembedded ${Math.min(i + BATCH, stations.length)} / ${stations.length}`);
  }
  process.stdout.write("\n");

  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  const binPath = path.join(OUT_DIR, "embeddings.bin");
  const idxPath = path.join(OUT_DIR, "embeddings-index.json");

  await writeFile(binPath, Buffer.from(vectors.buffer));
  await writeFile(
    idxPath,
    JSON.stringify({ dim: 384, count: uuids.length, uuids, generatedAt: new Date().toISOString() }),
  );

  const sizeMB = (vectors.byteLength / 1024 / 1024).toFixed(2);
  console.log(`wrote ${binPath} (${sizeMB} MB)`);
  console.log(`wrote ${idxPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
