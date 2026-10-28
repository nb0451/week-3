// ---------------------------------------------------------------------------
//  THE EVALUATION HARNESS
// ---------------------------------------------------------------------------
//  Runs every question in questions.json through retrieval and the function,
//  grades the answers, and prints a table.
//
//  Usage:
//    node tests/run_eval.js                     against chunks.json
//    node tests/run_eval.js --chunks other.json against a different chunking
//    node tests/run_eval.js --retrieval-only    skip the model, grade retrieval
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import * as cfg from "../config.js";
import { retrieve as keywordRetrieve, buildContext } from "../lib/retrieve.js";
import { retrieve as vectorRetrieve } from "../lib/retrieve_vector.js";
import handler, { demoAnswer } from "../api/chat.js";

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const has = (flag) => process.argv.includes(flag);

const ROOT = path.resolve(import.meta.dirname, "..");
const chunksPath = path.resolve(ROOT, arg("--chunks", "chunks.json"));
const doc = JSON.parse(fs.readFileSync(chunksPath, "utf8"));
const useVector = has("--vector");
if (useVector && !doc.vectoriser) {
  console.error(`${chunksPath} has no vectoriser. Run prep/vectorise.py on it first.`);
  process.exit(1);
}
const runRetrieve = (q) =>
  useVector
    ? vectorRetrieve(q, doc.chunks, { passages: cfg.PASSAGES,
        floor: cfg.SIMILARITY_FLOOR, vectoriser: doc.vectoriser })
    : keywordRetrieve(q, doc.chunks, { passages: cfg.PASSAGES,
        floor: cfg.SIMILARITY_FLOOR });
const set = JSON.parse(fs.readFileSync(path.join(ROOT, "questions.json"), "utf8"));

const contains = (text, needles) =>
  needles.some((n) => String(text).toLowerCase().includes(String(n).toLowerCase()));

/** Did retrieval surface a chunk that contains the expected fact? */
function retrievalHit(passages, expect) {
  if (expect.length === 0) return passages.length === 0;
  return passages.some((p) => contains(p.text, expect));
}

/**
 * Reciprocal rank. 1 if the right chunk is first, 0.5 if second, 0.333 if
 * third, 0 if it never shows up. Averaged over the set this is MRR, and unlike
 * a plain hit rate it notices when the right answer is buried under noise.
 */
function reciprocalRank(passages, expect) {
  if (expect.length === 0) return passages.length === 0 ? 1 : 0;
  for (let i = 0; i < passages.length; i += 1) {
    if (contains(passages[i].text, expect)) return 1 / (i + 1);
  }
  return 0;
}

/**
 * Context waste. Of the characters we are about to pay for, what fraction sit
 * in chunks that do not contain the answer? High waste means you are buying
 * tokens that cannot help you.
 */
function contextWaste(passages, expect) {
  const total = passages.reduce((n, p) => n + p.text.length, 0);
  if (total === 0 || expect.length === 0) return null;
  const useful = passages
    .filter((p) => contains(p.text, expect))
    .reduce((n, p) => n + p.text.length, 0);
  return (total - useful) / total;
}

async function answerFor(question, passages, context) {
  const req = new Request("http://local/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, passages, context }),
  });
  const res = await handler.fetch(req);
  return res.json();
}

function grade(item, passages, data) {
  if (item.kind === "must_refuse") {
    const refused = Boolean(data.blocked) || data.answer === cfg.OFF_TOPIC_REPLY;
    return { correct: refused, why: refused ? "refused" : "answered anyway" };
  }
  if (data.blocked) return { correct: false, why: `blocked: ${data.blockedBy || "guardrail"}` };
  const ok = contains(data.answer, item.expect_any);
  return { correct: ok, why: ok ? "fact present" : "fact missing from answer" };
}

const pad = (s, n) => String(s).padEnd(n).slice(0, n);

(async () => {
  console.log(`chunks   : ${path.basename(chunksPath)} `
    + `(strategy "${doc.strategy}", ${doc.chunks.length} chunks)`);
  console.log(`method   : ${useVector ? "TF-IDF cosine" : "keyword overlap"}`);
  console.log(`settings : PASSAGES=${cfg.PASSAGES} `
    + `FLOOR=${cfg.SIMILARITY_FLOOR} MAX_CONTEXT_CHARS=${cfg.MAX_CONTEXT_CHARS}`);
  console.log(`key      : ${process.env.GROQ_API_KEY ? "set, live model" : "not set, demo mode"}`);
  console.log("");
  console.log(pad("id", 4) + pad("kind", 13) + pad("retr", 6) + pad("ans", 6) + "note");
  console.log("-".repeat(78));

  const tally = { answerable: [0, 0], needs_faq: [0, 0], must_refuse: [0, 0],
    paraphrase: [0, 0] };
  let retrOk = 0;
  const rrs = [];
  const wastes = [];
  let charsSent = 0;

  for (const item of set.questions) {
    const passages = runRetrieve(item.q);
    const { context } = buildContext(passages, cfg.MAX_CONTEXT_CHARS);

    const rHit = retrievalHit(passages, item.expect_any);
    if (rHit) retrOk += 1;
    rrs.push(reciprocalRank(passages, item.expect_any));
    const w = contextWaste(passages, item.expect_any);
    if (w !== null) wastes.push(w);
    charsSent += context.length;

    let line;
    if (has("--retrieval-only")) {
      line = { correct: rHit, why: passages.map((p) => p.id).join(" ") || "nothing" };
    } else {
      const data = await answerFor(item.q, passages, context);
      line = grade(item, passages, data);
    }

    tally[item.kind][1] += 1;
    if (line.correct) tally[item.kind][0] += 1;

    console.log(
      pad(item.id, 4) + pad(item.kind, 13) +
      pad(rHit ? "ok" : "MISS", 6) +
      pad(line.correct ? "ok" : "FAIL", 6) + line.why
    );
  }

  console.log("-".repeat(78));
  const total = set.questions.length;
  const correct = Object.values(tally).reduce((n, [c]) => n + c, 0);
  for (const [kind, [c, n]] of Object.entries(tally)) {
    console.log(`${pad(kind, 14)} ${c}/${n}`);
  }
  console.log("");
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  console.log(`retrieval found the fact : ${retrOk}/${total} `
    + `(${(retrOk / total * 100).toFixed(1)}%)`);
  console.log(`retrieval MRR            : ${mean(rrs).toFixed(3)}`);
  console.log(`mean context waste       : ${(mean(wastes) * 100).toFixed(1)}%`);
  console.log(`mean chars per question  : ${Math.round(charsSent / total)}`);
  console.log(`graded correct           : ${correct}/${total} `
    + `(${(correct / total * 100).toFixed(1)}%)`);
})();
