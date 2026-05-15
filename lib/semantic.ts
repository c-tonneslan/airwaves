"use client";

// Client-side "vibe search". We ship pre-computed 384-dim sentence
// embeddings for the top stations as a static binary file, then load
// the MiniLM model lazily on first use to embed the user's query. The
// model is ~23MB compressed; after first download the browser caches
// it and subsequent searches feel instant.
//
// Why precompute? Embedding 1,500 stations in the browser on first
// search would take 20-30 seconds. Precomputing makes only the query
// embedding (~50ms) and the cosine search (~5ms over 1,500 vectors)
// happen at runtime.

let modelLoading: Promise<unknown> | null = null;
let model: unknown | null = null;

interface EmbeddingsIndex {
  dim: number;
  count: number;
  uuids: string[];
  generatedAt: string;
}

interface LoadedEmbeddings {
  vectors: Float32Array;
  index: EmbeddingsIndex;
}

let embeddingsCache: LoadedEmbeddings | null = null;
let embeddingsPromise: Promise<LoadedEmbeddings> | null = null;

export async function ensureEmbeddings(): Promise<LoadedEmbeddings> {
  if (embeddingsCache) return embeddingsCache;
  if (embeddingsPromise) return embeddingsPromise;
  embeddingsPromise = (async () => {
    const [indexResp, binResp] = await Promise.all([
      fetch("/embeddings-index.json"),
      fetch("/embeddings.bin"),
    ]);
    if (!indexResp.ok || !binResp.ok) {
      throw new Error("vibe search data not available");
    }
    const index = (await indexResp.json()) as EmbeddingsIndex;
    const buf = await binResp.arrayBuffer();
    const vectors = new Float32Array(buf);
    if (vectors.length !== index.count * index.dim) {
      throw new Error(
        `embedding size mismatch: bin has ${vectors.length} floats, index expects ${index.count}*${index.dim}`,
      );
    }
    const loaded: LoadedEmbeddings = { vectors, index };
    embeddingsCache = loaded;
    return loaded;
  })();
  return embeddingsPromise;
}

async function ensureModel(): Promise<unknown> {
  if (model) return model;
  if (modelLoading) return modelLoading;
  modelLoading = (async () => {
    // Dynamic import keeps the ~MB transformers bundle out of the main
    // page load. The module is only fetched when the user actually
    // triggers vibe search.
    const { pipeline } = await import("@huggingface/transformers");
    const m = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      // Use the quantized variant; ~23MB instead of ~90MB.
      dtype: "q8",
    });
    model = m;
    return m;
  })();
  return modelLoading;
}

interface SemanticResult {
  uuid: string;
  score: number;
}

/**
 * Embed the query, then cosine-search the loaded station vectors. Both
 * sides are normalised at index time (the embed-stations script passes
 * `normalize: true`), so cosine reduces to a plain dot product.
 */
export async function semanticSearch(
  query: string,
  k = 30,
): Promise<SemanticResult[]> {
  const [m, { vectors, index }] = await Promise.all([ensureModel(), ensureEmbeddings()]);

  // The pipeline returns a Tensor-like object whose `data` is Float32Array.
  // We turn off type checking here because the model output type varies
  // between minor releases of transformers.js; the only shape we depend
  // on is `data.length === dim` after mean pooling + normalization.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = await (m as any)(query, { pooling: "mean", normalize: true });
  const q = out.data as Float32Array;
  if (q.length !== index.dim) {
    throw new Error(`query dim ${q.length} != index dim ${index.dim}`);
  }

  // Top-k by dot product. Use a small heap-equivalent (just keep a
  // sorted array of length k) since k is tiny relative to N.
  const dim = index.dim;
  const topK: { i: number; score: number }[] = [];
  for (let i = 0; i < index.count; i++) {
    let score = 0;
    const base = i * dim;
    for (let d = 0; d < dim; d++) score += vectors[base + d] * q[d];
    if (topK.length < k) {
      topK.push({ i, score });
      if (topK.length === k) topK.sort((a, b) => b.score - a.score);
    } else if (score > topK[topK.length - 1].score) {
      topK[topK.length - 1] = { i, score };
      // re-sort; cheap for small k
      topK.sort((a, b) => b.score - a.score);
    }
  }
  topK.sort((a, b) => b.score - a.score);
  return topK.map((r) => ({ uuid: index.uuids[r.i], score: r.score }));
}

export function isEmbeddingsAvailable(): boolean {
  return embeddingsCache != null;
}
