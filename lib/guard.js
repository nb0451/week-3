// ---------------------------------------------------------------------------
//  GUARDRAILS
// ---------------------------------------------------------------------------
//  Four checks. Two run before the model is called, two run on its answer.
//  Each returns { ok, rule, detail } so the trace can say which one fired.
// ---------------------------------------------------------------------------

/** Before the model: is there anything relevant to answer from at all? */
export function checkHasContext(passages) {
  if (!passages || passages.length === 0) {
    return { ok: false, rule: "no-relevant-passage",
             detail: "nothing scored above SIMILARITY_FLOOR" };
  }
  return { ok: true, rule: "no-relevant-passage", detail: `${passages.length} passages` };
}

/** Before the model: is the question absurdly long or empty? */
export function checkQuestion(question) {
  const q = (question || "").trim();
  if (q.length === 0) {
    return { ok: false, rule: "empty-question", detail: "nothing asked" };
  }
  if (q.length > 500) {
    return { ok: false, rule: "question-too-long",
             detail: `${q.length} characters, limit 500` };
  }
  return { ok: true, rule: "question-shape", detail: `${q.length} characters` };
}

/** After the model: did it say one of the forbidden things? */
export function checkBannedPhrases(answer, banned) {
  const lower = (answer || "").toLowerCase();
  for (const phrase of banned || []) {
    if (lower.includes(String(phrase).toLowerCase())) {
      return { ok: false, rule: "banned-phrase", detail: `found "${phrase}"` };
    }
  }
  return { ok: true, rule: "banned-phrase", detail: "none found" };
}

/**
 * After the model: is the answer actually grounded in what we retrieved?
 * Cheap version. Takes the content words of the answer and asks how many of
 * them appear anywhere in the context. Low overlap means the model is likely
 * drawing on something other than your notes.
 */
export function checkGrounded(answer, context, { minOverlap = 0.35 } = {}) {
  const words = (t) =>
    new Set((t || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/).filter((w) => w.length > 3));
  const a = words(answer);
  const c = words(context);
  if (a.size === 0) {
    return { ok: false, rule: "grounded", detail: "empty answer" };
  }
  let hits = 0;
  for (const w of a) if (c.has(w)) hits += 1;
  const ratio = hits / a.size;
  const pct = Math.round(ratio * 100);
  if (ratio < minOverlap) {
    return { ok: false, rule: "grounded",
             detail: `only ${pct}% of answer words appear in the notes` };
  }
  return { ok: true, rule: "grounded", detail: `${pct}% of answer words in the notes` };
}

/** Run every post-answer check, return the first failure or an ok result. */
export function checkAnswer(answer, context, banned) {
  const results = [
    checkBannedPhrases(answer, banned),
    checkGrounded(answer, context),
  ];
  const failed = results.find((r) => !r.ok);
  return { ok: !failed, results, failed: failed || null };
}
