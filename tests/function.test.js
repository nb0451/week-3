import { test } from "node:test";
import assert from "node:assert/strict";
import handler, { estimateTokens, buildMessages, demoAnswer } from "../api/chat.js";
import * as cfg from "../config.js";

const post = (body) =>
  handler.fetch(new Request("http://local/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

const P = [{ id: "about-1", heading: "About", score: 0.11,
  text: "I am based in Bangalore, India, and I work remotely." }];

test("GET reports health without calling a model", async () => {
  const res = await handler.fetch(new Request("http://local/api/chat"));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.model, cfg.MODEL);
  assert.equal(typeof body.keyConfigured, "boolean");
});

test("an unsupported method is refused", async () => {
  const res = await handler.fetch(
    new Request("http://local/api/chat", { method: "DELETE" }));
  assert.equal(res.status, 405);
});

test("a non-JSON body is refused", async () => {
  const res = await handler.fetch(new Request("http://local/api/chat", {
    method: "POST", body: "not json",
    headers: { "content-type": "application/json" },
  }));
  assert.equal(res.status, 400);
});

test("an oversized context is refused", async () => {
  const res = await post({ question: "hi", passages: P, context: "x".repeat(20001) });
  assert.equal(res.status, 413);
});

test("no passages produces the off-topic reply, not a model call", async () => {
  const res = await post({ question: "Who won the cup?", passages: [], context: "" });
  const body = await res.json();
  assert.equal(body.blocked, true);
  assert.equal(body.answer, cfg.OFF_TOPIC_REPLY);
  const fired = body.trace.guardrails.find((g) => !g.ok);
  assert.equal(fired.rule, "no-relevant-passage");
});

test("an empty question is blocked", async () => {
  const res = await post({ question: "", passages: P, context: P[0].text });
  const body = await res.json();
  assert.equal(body.blocked, true);
});

test("demo mode answers from the passage and labels itself", async () => {
  const res = await post({
    question: "Where are you based?", passages: P, context: `[about-1] ${P[0].text}`,
  });
  const body = await res.json();
  assert.equal(body.blocked, false);
  assert.match(body.answer, /DEMO MODE/);
  assert.match(body.answer.toLowerCase(), /bangalore/);
  assert.equal(body.trace.mode, "demo");
});

test("the trace records retrieval, guardrails and tokens", async () => {
  const res = await post({
    question: "Where are you based?", passages: P, context: `[about-1] ${P[0].text}`,
  });
  const { trace } = await res.json();
  assert.equal(trace.retrieval.length, 1);
  assert.equal(trace.retrieval[0].id, "about-1");
  assert.ok(trace.guardrails.length >= 3);
  assert.ok(trace.tokens.promptTokensEstimated > 0);
  assert.ok(trace.tokens.promptCharsSent > 0);
});

test("estimateTokens is four characters to a token", () => {
  assert.equal(estimateTokens("x".repeat(400)), 100);
  assert.equal(estimateTokens(""), 0);
});

test("buildMessages puts the notes in the system message", () => {
  const m = buildMessages("Q?", "THE NOTES", "Do the thing.", "Sample Person");
  assert.equal(m.length, 2);
  assert.equal(m[0].role, "system");
  assert.ok(m[0].content.includes("THE NOTES"));
  assert.ok(m[0].content.includes("Sample Person"));
  assert.equal(m[1].content, "Q?");
});

test("demoAnswer refuses when nothing matches the question", () => {
  const out = demoAnswer(
    [{ heading: "About", text: "I am based in Bangalore." }], "zzzz qqqq");
  assert.match(out, /do not have a note/);
});

test("demoAnswer picks the sentence that matches the question", () => {
  const out = demoAnswer([{ heading: "X", text:
    "I write Python daily. My notice period is thirty days. I like tea." }],
    "What is your notice period?");
  assert.match(out.toLowerCase(), /thirty days/);
});
