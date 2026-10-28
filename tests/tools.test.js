import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOL_SCHEMAS, makeToolbox, runToolLoop } from "../lib/tools.js";

const PROJECTS = {
  "News triage assistant": { stack: "Python, Gradio, SQLite", accuracy: "83%" },
  "This portfolio": { stack: "HTML, Vercel Functions" },
};

const saved = [];
const toolbox = makeToolbox({
  projects: PROJECTS,
  meetingUrl: "https://cal.com/sample-person/30min",
  saveLead: async (lead) => { saved.push(lead); },
});

/** A transport that replays a scripted sequence of assistant messages. */
const scripted = (script) => {
  let i = 0;
  return async () => script[Math.min(i++, script.length - 1)];
};

const toolCall = (name, args) => ({
  role: "assistant", content: null,
  tool_calls: [{ id: `call_${name}`, type: "function",
    function: { name, arguments: JSON.stringify(args) } }],
});
const plain = (content) => ({ role: "assistant", content, tool_calls: [] });

test("the three tools are declared in the shape Groq expects", () => {
  assert.equal(TOOL_SCHEMAS.length, 3);
  for (const t of TOOL_SCHEMAS) {
    assert.equal(t.type, "function");
    assert.ok(t.function.name);
    assert.ok(t.function.description.length > 20);
    assert.equal(t.function.parameters.type, "object");
    assert.ok(Array.isArray(t.function.parameters.required));
  }
  assert.deepEqual(TOOL_SCHEMAS.map((t) => t.function.name),
    ["get_project", "share_meeting_link", "log_lead"]);
});

test("get_project finds a project by partial name", async () => {
  const r = await toolbox.get_project({ name: "news triage" });
  assert.equal(r.found, true);
  assert.equal(r.name, "News triage assistant");
  assert.equal(r.accuracy, "83%");
});

test("get_project reports what it does know when it misses", async () => {
  const r = await toolbox.get_project({ name: "blockchain thing" });
  assert.equal(r.found, false);
  assert.deepEqual(r.known, Object.keys(PROJECTS));
});

test("share_meeting_link returns the configured url", async () => {
  const r = await toolbox.share_meeting_link();
  assert.equal(r.ok, true);
  assert.match(r.url, /cal\.com/);
});

test("share_meeting_link fails cleanly when unconfigured", async () => {
  const bare = makeToolbox({ projects: {}, meetingUrl: "" });
  assert.equal((await bare.share_meeting_link()).ok, false);
});

test("log_lead rejects a malformed email and saves nothing", async () => {
  const before = saved.length;
  const r = await toolbox.log_lead({ name: "X", email: "not-an-email" });
  assert.equal(r.ok, false);
  assert.equal(saved.length, before);
});

test("log_lead saves a good lead", async () => {
  const r = await toolbox.log_lead({
    name: "Dana", email: "dana@example.com", note: "hiring" });
  assert.equal(r.ok, true);
  assert.equal(saved.at(-1).email, "dana@example.com");
});

test("a question needing no tool returns straight away", async () => {
  const out = await runToolLoop({
    messages: [{ role: "user", content: "Where are you based?" }],
    transport: scripted([plain("I am based in Bangalore.")]),
    toolbox,
  });
  assert.equal(out.calls.length, 0);
  assert.equal(out.turns, 1);
  assert.match(out.answer, /Bangalore/);
});

test("one tool call is executed and fed back, then answered", async () => {
  const out = await runToolLoop({
    messages: [{ role: "user", content: "Tell me about the news triage assistant" }],
    transport: scripted([
      toolCall("get_project", { name: "news triage assistant" }),
      plain("It sorts news into four categories and scored 83%."),
    ]),
    toolbox,
  });
  assert.equal(out.calls.length, 1);
  assert.equal(out.calls[0].name, "get_project");
  assert.equal(out.calls[0].result.found, true);
  assert.equal(out.turns, 2);
  const toolMsg = out.history.find((m) => m.role === "tool");
  assert.equal(toolMsg.tool_call_id, "call_get_project");
  assert.match(toolMsg.content, /83%/);
});

test("two tools in sequence, one per turn", async () => {
  const out = await runToolLoop({
    messages: [{ role: "user", content: "I'd like to talk. I'm dana@example.com" }],
    transport: scripted([
      toolCall("share_meeting_link", {}),
      toolCall("log_lead", { name: "Dana", email: "dana@example.com", note: "wants a call" }),
      plain("Here is my booking link, and I have noted your email."),
    ]),
    toolbox,
  });
  assert.deepEqual(out.calls.map((c) => c.name),
    ["share_meeting_link", "log_lead"]);
  assert.equal(out.turns, 3);
});

test("malformed tool arguments are reported back, not thrown", async () => {
  const out = await runToolLoop({
    messages: [{ role: "user", content: "x" }],
    transport: scripted([
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function",
        function: { name: "get_project", arguments: "{not json" } }] },
      plain("Sorry, I could not look that up."),
    ]),
    toolbox,
  });
  assert.equal(out.calls[0].badArguments, true);
  assert.match(out.history.find((m) => m.role === "tool").content, /not valid JSON/);
});

test("an unknown tool name is handled", async () => {
  const out = await runToolLoop({
    messages: [{ role: "user", content: "x" }],
    transport: scripted([toolCall("delete_everything", {}), plain("No.")]),
    toolbox,
  });
  assert.equal(out.calls[0].result.ok, false);
  assert.match(out.calls[0].result.reason, /no such tool/);
});

test("a model that never stops calling tools is cut off", async () => {
  const out = await runToolLoop({
    messages: [{ role: "user", content: "x" }],
    transport: scripted([toolCall("share_meeting_link", {})]),
    toolbox,
    maxTurns: 3,
  });
  assert.equal(out.exhausted, true);
  assert.equal(out.turns, 3);
  assert.equal(out.calls.length, 3);
});
