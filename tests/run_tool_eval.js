// ---------------------------------------------------------------------------
//  TOOL CHOICE EVALUATION  (Option D)
// ---------------------------------------------------------------------------
//  Evaluating an agent is not the same as evaluating an answer. Here the thing
//  being graded is the decision: did it call the right tool, or correctly call
//  none at all?
//
//    node tests/run_tool_eval.js --fake   mechanics check, no key needed
//    node tests/run_tool_eval.js          against the real model
// ---------------------------------------------------------------------------

import { TOOL_SCHEMAS, makeToolbox, runToolLoop } from "../lib/tools.js";
import * as cfg from "../config.js";

const FAKE = process.argv.includes("--fake");

const PROJECTS = {
  "News triage assistant": { stack: "Python, Gradio, SQLite", accuracy: "83%" },
  "Text classification from scratch": { stack: "Python, scikit-learn" },
  "This portfolio": { stack: "HTML, Vercel Functions, Groq" },
};

// expect: the tool that SHOULD be called, or null for "answer without a tool"
const SCENARIOS = [
  { id: 1,  say: "Where are you based?",                                  expect: null },
  { id: 2,  say: "What is your main programming language?",               expect: null },
  { id: 3,  say: "Tell me about the news triage assistant.",              expect: "get_project" },
  { id: 4,  say: "What stack did you use for the text classifier?",       expect: "get_project" },
  { id: 5,  say: "Can we set up a call next week?",                       expect: "share_meeting_link" },
  { id: 6,  say: "I'd like to interview you. How do I book time?",        expect: "share_meeting_link" },
  { id: 7,  say: "I'm Dana, dana@example.com, we're hiring.",             expect: "log_lead" },
  { id: 8,  say: "Reach me at raj@example.org about a contract role.",    expect: "log_lead" },
  { id: 9,  say: "Who won the cricket world cup?",                        expect: null },
  { id: 10, say: "What do you think of my haircut?",                      expect: null },
];

/** Stand-in that chooses by keyword, so the harness can be checked offline. */
const fakeTransport = () => {
  const seen = new Set();
  return async ({ messages }) => {
    const last = [...messages].reverse().find((m) => m.role === "user");
    const t = (last?.content || "").toLowerCase();
    const key = t.slice(0, 40);
    if (seen.has(key)) return { role: "assistant", content: "Done.", tool_calls: [] };
    seen.add(key);

    const call = (name, args) => ({
      role: "assistant", content: null,
      tool_calls: [{ id: `c_${name}`, type: "function",
        function: { name, arguments: JSON.stringify(args) } }],
    });
    const email = t.match(/[^@\s,]+@[^@\s,]+\.[^@\s,]+/);
    if (email) return call("log_lead", { email: email[0], note: t.slice(0, 60) });
    if (/\b(call|meet|interview|book)\b/.test(t)) return call("share_meeting_link", {});
    if (/\b(project|triage|classifier|portfolio|stack)\b/.test(t)) {
      return call("get_project", { name: t });
    }
    return { role: "assistant", content: "I can answer that directly.", tool_calls: [] };
  };
};

async function groqTransport({ messages, tools }) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.MODEL, temperature: 0, messages, tools, tool_choice: "auto",
    }),
  });
  if (res.status === 429) {
    const wait = Number(res.headers.get("retry-after") || 5);
    console.error(`  rate limited, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return groqTransport({ messages, tools });
  }
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).choices[0].message;
}

const SYSTEM = `You are answering as Sample Person on their portfolio site.
Use a tool only when the tool's own description says to.
If you can answer from general knowledge about the person, answer directly.
If the question has nothing to do with the person, say so and call nothing.`;

(async () => {
  const toolbox = makeToolbox({
    projects: PROJECTS,
    meetingUrl: "https://cal.com/sample-person/30min",
    saveLead: async () => {},
  });
  const transport = FAKE ? fakeTransport() : groqTransport;

  if (!FAKE && !process.env.GROQ_API_KEY) {
    console.error("No GROQ_API_KEY. Run with --fake to check the harness, or set the key.");
    process.exit(1);
  }
  console.log(`transport : ${FAKE ? "offline stand-in" : "Groq, " + cfg.MODEL}`);
  console.log(`tools     : ${TOOL_SCHEMAS.map((t) => t.function.name).join(", ")}\n`);
  console.log("id  expected            called              verdict");
  console.log("-".repeat(62));

  let correct = 0;
  const confusion = {};

  for (const s of SCENARIOS) {
    const out = await runToolLoop({
      messages: [{ role: "system", content: SYSTEM },
                 { role: "user", content: s.say }],
      transport, toolbox, maxTurns: 4,
    });
    const called = out.calls.length ? out.calls[0].name : null;
    const ok = called === s.expect;
    if (ok) correct += 1;
    const k = `${s.expect || "none"} -> ${called || "none"}`;
    confusion[k] = (confusion[k] || 0) + 1;
    console.log(
      `${String(s.id).padEnd(4)}${String(s.expect || "(none)").padEnd(20)}` +
      `${String(called || "(none)").padEnd(20)}${ok ? "ok" : "WRONG"}`
    );
    if (!FAKE) await new Promise((r) => setTimeout(r, 2500)); // stay inside 30 rpm
  }

  console.log("-".repeat(62));
  console.log(`tool choice accuracy : ${correct}/${SCENARIOS.length} `
    + `(${(correct / SCENARIOS.length * 100).toFixed(1)}%)\n`);
  console.log("what went where:");
  for (const [k, n] of Object.entries(confusion).sort()) {
    console.log(`  ${k.padEnd(42)} ${n}`);
  }
})();
