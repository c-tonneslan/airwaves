import type { Station } from "./types";

// TF-IDF cosine similarity over each station's tag list. The math is the
// textbook IR formulation:
//
//   tf(t, d)  = 1 + log(count of t in d)
//   idf(t)    = log(N / df(t))
//   weight    = tf * idf
//   cos(a, b) = dot(a, b) / (|a| * |b|)
//
// We build an inverted index from term to station so lookup is O(terms in
// the query × stations sharing each term) rather than O(stations × tags).
// For 5,000 stations and ~5 tags each, queries run in well under a frame.

interface Vector {
  terms: Map<string, number>;
  norm: number;
}

export interface SimilarityIndex {
  vectors: Map<string, Vector>;
  postings: Map<string, string[]>;
}

const STOP_TAGS = new Set([
  // generic "this is a radio" tags that don't differentiate
  "music",
  "radio",
  "fm",
  "am",
  "hd",
  "online",
  "internet",
  "stream",
  "streaming",
  "live",
  "podcast",
]);

function tokenize(tagString: string): string[] {
  if (!tagString) return [];
  const out: string[] = [];
  for (const raw of tagString.split(",")) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (t.length > 40) continue;
    if (STOP_TAGS.has(t)) continue;
    out.push(t);
  }
  return out;
}

export function buildSimilarityIndex(stations: Station[]): SimilarityIndex {
  const N = stations.length || 1;
  const docFreq = new Map<string, number>();

  // First pass: document frequency for IDF.
  for (const s of stations) {
    const unique = new Set(tokenize(s.tags));
    for (const t of unique) {
      docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    }
  }

  const vectors = new Map<string, Vector>();
  const postings = new Map<string, string[]>();

  for (const s of stations) {
    const counts = new Map<string, number>();
    for (const t of tokenize(s.tags)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const terms = new Map<string, number>();
    let normSq = 0;
    for (const [term, count] of counts) {
      const df = docFreq.get(term) ?? 1;
      // Skip extremely common terms (appear in >40% of stations) since
      // they add noise without distinguishing anything.
      if (df / N > 0.4) continue;
      const idf = Math.log(N / df);
      const tf = 1 + Math.log(count);
      const weight = tf * idf;
      if (weight <= 0) continue;
      terms.set(term, weight);
      normSq += weight * weight;
      let posting = postings.get(term);
      if (!posting) {
        posting = [];
        postings.set(term, posting);
      }
      posting.push(s.stationuuid);
    }
    vectors.set(s.stationuuid, { terms, norm: Math.sqrt(normSq) });
  }

  return { vectors, postings };
}

export interface SimilarStation {
  uuid: string;
  score: number;
}

export function findSimilar(
  index: SimilarityIndex,
  uuid: string,
  k = 20,
): SimilarStation[] {
  const query = index.vectors.get(uuid);
  if (!query || query.norm === 0) return [];

  // Walk the postings list for each query term and accumulate dot product
  // contributions per candidate station.
  const dot = new Map<string, number>();
  for (const [term, qWeight] of query.terms) {
    const posting = index.postings.get(term);
    if (!posting) continue;
    for (const sid of posting) {
      if (sid === uuid) continue;
      const otherWeight = index.vectors.get(sid)?.terms.get(term) ?? 0;
      dot.set(sid, (dot.get(sid) ?? 0) + qWeight * otherWeight);
    }
  }

  const scored: SimilarStation[] = [];
  for (const [sid, dp] of dot) {
    const otherNorm = index.vectors.get(sid)?.norm ?? 0;
    if (otherNorm === 0) continue;
    scored.push({ uuid: sid, score: dp / (query.norm * otherNorm) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
