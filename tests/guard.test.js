import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkQuestion, checkHasContext, checkBannedPhrases, checkGrounded, checkAnswer,
} from "../lib/guard.js";

test("an empty question is rejected", () => {
  assert.equal(checkQuestion("   ").ok, false);
});

test("a very long question is rejected", () => {
  assert.equal(checkQuestion("x".repeat(501)).ok, false);
  assert.equal(checkQuestion("x".repeat(499)).ok, true);
});

test("no passages means no context", () => {
  assert.equal(checkHasContext([]).ok, false);
  assert.equal(checkHasContext([{ id: "a" }]).ok, true);
});

test("a banned phrase is caught regardless of case", () => {
  const r = checkBannedPhrases("As An AI I cannot", ["as an ai"]);
  assert.equal(r.ok, false);
  assert.match(r.detail, /as an ai/);
});

test("an answer with no banned phrase passes", () => {
  assert.equal(checkBannedPhrases("I am based in Bangalore.", ["as an ai"]).ok, true);
});

test("a grounded answer passes", () => {
  const ctx = "I am based in Bangalore and I work remotely across time zones.";
  assert.equal(checkGrounded("I am based in Bangalore, working remotely.", ctx).ok, true);
});

test("an ungrounded answer fails", () => {
  const ctx = "I am based in Bangalore.";
  const r = checkGrounded(
    "I previously captained the national swimming team in Reykjavik.", ctx);
  assert.equal(r.ok, false);
  assert.match(r.detail, /appear in the notes/);
});

test("an empty answer is not grounded", () => {
  assert.equal(checkGrounded("", "anything").ok, false);
});

test("checkAnswer reports the first failing rule", () => {
  const out = checkAnswer("As an AI, I live in Bangalore.",
    "I live in Bangalore.", ["as an ai"]);
  assert.equal(out.ok, false);
  assert.equal(out.failed.rule, "banned-phrase");
});

test("checkAnswer passes a clean grounded answer", () => {
  const out = checkAnswer("I live in Bangalore.", "I live in Bangalore.", ["as an ai"]);
  assert.equal(out.ok, true);
  assert.equal(out.failed, null);
});
