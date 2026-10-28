// ---------------------------------------------------------------------------
//  RETRIEVAL, VECTOR VERSION  (Option B ships this instead of retrieve.js)
// ---------------------------------------------------------------------------
//  Builds a TF-IDF vector for the question using the vocabulary that Python
//  exported, then ranks chunks by cosine similarity.
//
//  Both sides are L2 normalised, so the cosine is just the dot product.
//
//  The tokeniser below has to match scikit-learn's default exactly, or the
//  question lands in a different part of the vector space from the chunks.
//  scikit-learn uses lowercase=True and token_pattern r"\b\w\w+\b", which is
//  "two or more word characters", so that is what this does.
// ---------------------------------------------------------------------------

// scikit-learn's default is r"(?u)\b\w\w+\b". The (?u) makes Python's \w
// match any Unicode letter; JavaScript's \w is ASCII only. For English notes
// the two agree exactly. If your notes contain accented characters, the two
// sides will tokenise them differently and those words will stop matching.
// Fix by passing a token_pattern of [a-z0-9]{2,} on the Python side so both
// sides are ASCII, or by writing the names without accents in content/.
const TOKEN = /\b\w\w+\b/g;

export function tokenise(text) {
  return String(text).toLowerCase().match(TOKEN) || [];
}

/**
 * Build the sparse query vector: { vocabIndex: weight }, L2 normalised.
 */
export function vectoriseQuery(question, vectoriser) {
  const { vocab, idf, sublinear_tf: sublinear } = vectoriser;

  const counts = new Map();
  for (const tok of tokenise(question)) {
    const idx = vocab[tok];
    if (idx === undefined) continue; // not in the fitted vocabulary
    counts.set(idx, (counts.get(idx) || 0) + 1);
  }
  if (counts.size === 0) return {};

  const raw = new Map();
  for (const [idx, count] of counts) {
    const tf = sublinear ? 1 + Math.log(count) : count;
    raw.set(idx, tf * idf[idx]);
  }

  let sumsq = 0;
  for (const w of raw.values()) sumsq += w * w;
  const norm = Math.sqrt(sumsq);
  if (norm === 0) return {};

  const out = {};
  for (const [idx, w] of raw) out[idx] = w / norm;
  return out;
}

/** Dot product of two sparse vectors keyed by vocabulary index. */
export function cosine(a, b) {
  let dot = 0;
  const [small, large] =
    Object.keys(a).length <= Object.keys(b).length ? [a, b] : [b, a];
  for (const k in small) {
    const other = large[k];
    if (other !== undefined) dot += small[k] * other;
  }
  return dot;
}

/**
 * Same signature as retrieve() in retrieve.js, so nothing else has to change.
 * `chunks` must carry a `vec` field and `vectoriser` must be the exported one.
 */
export function retrieve(question, chunks, { passages = 3, floor = 0, vectoriser } = {}) {
  if (!vectoriser) throw new Error("retrieve(): vectoriser is required");
  const q = vectoriseQuery(question, vectoriser);
  if (Object.keys(q).length === 0) return [];

  return chunks
    .map((c) => ({ ...c, score: Math.round(cosine(q, c.vec || {}) * 1e7) / 1e7 }))
    .filter((c) => c.score > floor)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, passages);
}

export { buildContext } from "./retrieve.js";
export const RETRIEVAL_METHOD = "TF-IDF cosine";
