import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { terms, score, retrieve, buildContext } from "../lib/retrieve.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "chunks.json"), "utf8"));

test("terms drops stopwords and short words", () => {
  assert.deepEqual(terms("Where are you based?"), ["based"]);
  assert.deepEqual(terms("the a an of"), []);
});

test("terms keeps hyphenated and numeric tokens", () => {
  const t = terms("TF-IDF scored 0.42");
  assert.ok(t.includes("tf-idf"), "hyphen should survive");
  // "0.42" loses its dot and the lone "0" is too short, so "42" is what is left
  assert.ok(t.includes("42"), `got ${JSON.stringify(t)}`);
  assert.ok(!t.includes("0"), "single characters are dropped");
});

test("score is zero when nothing is shared", () => {
  assert.equal(score("elephant giraffe", "quarterly revenue report"), 0);
});

test("score rises with more shared words", () => {
  const one = score("python", "I write python every day");
  const two = score("python retrieval", "I write python and build retrieval");
  assert.ok(two > one, `${two} should exceed ${one}`);
});

test("score is damped by chunk length", () => {
  const short = score("python", "python");
  const long = score("python", "python " + "filler ".repeat(60));
  assert.ok(short > long, "a long chunk must not win on length alone");
});

test("retrieve respects the passage limit", () => {
  const hits = retrieve("python retrieval evaluation", doc.chunks, { passages: 2 });
  assert.equal(hits.length, 2);
});

test("retrieve drops everything below the floor", () => {
  const hits = retrieve("python", doc.chunks, { passages: 5, floor: 0.99 });
  assert.equal(hits.length, 0);
});

test("retrieve returns nothing for an unrelated question", () => {
  const hits = retrieve("Who won the cricket world cup?", doc.chunks,
    { passages: 3, floor: 0.05 });
  assert.equal(hits.length, 0);
});

test("retrieve is ordered by descending score", () => {
  const hits = retrieve("retrieval evaluation chunking", doc.chunks, { passages: 5 });
  for (let i = 1; i < hits.length; i += 1) {
    assert.ok(hits[i - 1].score >= hits[i].score);
  }
});

test("retrieve is deterministic", () => {
  const a = retrieve("python", doc.chunks, { passages: 3 }).map((h) => h.id);
  const b = retrieve("python", doc.chunks, { passages: 3 }).map((h) => h.id);
  assert.deepEqual(a, b);
});

test("buildContext stops before the character limit", () => {
  const hits = retrieve("python retrieval evaluation", doc.chunks, { passages: 3 });
  const { context, used, droppedForSpace } = buildContext(hits, 200);
  assert.ok(context.length <= 200 + 50, `context was ${context.length}`);
  assert.ok(used < hits.length || hits.length === 0);
  assert.ok(droppedForSpace > 0);
});

test("buildContext keeps everything when the limit is generous", () => {
  const hits = retrieve("python", doc.chunks, { passages: 3 });
  const { used, droppedForSpace } = buildContext(hits, 100000);
  assert.equal(used, hits.length);
  assert.equal(droppedForSpace, 0);
});

test("every chunk carries the fields the app expects", () => {
  for (const c of doc.chunks) {
    assert.ok(c.id, "missing id");
    assert.ok(c.file, "missing file");
    assert.ok(c.text, "missing text");
    assert.equal(typeof c.chars, "number");
  }
});

test("chunk ids are unique", () => {
  const ids = doc.chunks.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});
