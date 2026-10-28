// ---------------------------------------------------------------------------
//  RETRIEVAL  (Option A ships this version)
// ---------------------------------------------------------------------------
//  Scores every chunk against the question by counting words they share.
//  No model, no vectors, no network. It is the cheapest thing that works, and
//  it fails in ways you can see, which is why we start here.
//
//  Option B replaces this file. Keep it around so you can compare.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","but","by","can","did","do","does","for",
  "from","had","has","have","he","her","his","how","i","if","in","is","it","its",
  "me","my","of","on","or","our","she","so","that","the","their","them","then",
  "there","these","they","this","to","was","we","were","what","when","where",
  "which","who","why","will","with","would","you","your",
]);

export function terms(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Shared-word score, damped by chunk length so that a long chunk cannot win
 * just by being long.
 *   score = (words in common) / sqrt(distinct words in the chunk)
 */
export function score(question, chunkText) {
  const q = new Set(terms(question));
  const c = new Set(terms(chunkText));
  if (q.size === 0 || c.size === 0) return 0;
  let shared = 0;
  for (const w of q) if (c.has(w)) shared += 1;
  return shared / Math.sqrt(c.size);
}

/**
 * Rank chunks, drop anything under the floor, return the top `passages`.
 * Returns [{ id, file, heading, text, score }] with score rounded to 4dp.
 */
export function retrieve(question, chunks, { passages = 3, floor = 0 } = {}) {
  return chunks
    .map((c) => ({ ...c, score: Math.round(score(question, c.text) * 1e4) / 1e4 }))
    .filter((c) => c.score > floor)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, passages);
}

/**
 * Join passages into the context string, stopping before `maxChars`.
 * Returns { context, used, droppedForSpace }.
 */
export function buildContext(passages, maxChars) {
  const kept = [];
  let total = 0;
  let dropped = 0;
  for (const p of passages) {
    const block = `[${p.id}] ${p.text}`;
    if (total + block.length > maxChars) { dropped += 1; continue; }
    kept.push(block);
    total += block.length + 2;
  }
  return { context: kept.join("\n\n"), used: kept.length, droppedForSpace: dropped };
}

export const RETRIEVAL_METHOD = "keyword overlap";
