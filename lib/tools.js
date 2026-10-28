// ---------------------------------------------------------------------------
//  TOOL CALLING  (Option D)
// ---------------------------------------------------------------------------
//  Three tools. The model decides which, if any, to call.
//
//  openai/gpt-oss-120b does NOT support parallel tool calls, so the loop below
//  handles one call per turn. Do not write it expecting an array of several.
// ---------------------------------------------------------------------------

export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "get_project",
      description:
        "Look up full detail about one named project. Use when the visitor " +
        "asks about a specific project rather than about the person generally.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "The project name as the visitor said it" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "share_meeting_link",
      description:
        "Return the booking link. Use ONLY when the visitor expresses an " +
        "intention to talk, meet, call or interview. Do not use it to answer " +
        "a factual question.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "log_lead",
      description:
        "Record a visitor who has left their contact details. Use ONLY when " +
        "the visitor has actually given a name or an email address.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          note: { type: "string", description: "Why they got in touch" },
        },
        required: ["email"],
      },
    },
  },
];

/** Everything a tool is allowed to do lives here, so it can be tested. */
export function makeToolbox({ projects = {}, meetingUrl = "", saveLead } = {}) {
  return {
    async get_project({ name }) {
      const key = String(name || "").toLowerCase().trim();
      const hit = Object.entries(projects).find(
        ([k]) => k.toLowerCase() === key || k.toLowerCase().includes(key)
      );
      if (!hit) {
        return { found: false, known: Object.keys(projects) };
      }
      return { found: true, name: hit[0], ...hit[1] };
    },

    async share_meeting_link() {
      if (!meetingUrl) return { ok: false, reason: "no meeting URL configured" };
      return { ok: true, url: meetingUrl };
    },

    async log_lead({ name = "", email = "", note = "" }) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return { ok: false, reason: "that does not look like an email address" };
      }
      if (saveLead) await saveLead({ name, email, note });
      return { ok: true, recorded: email };
    },
  };
}

/**
 * Run the conversation until the model answers without asking for a tool.
 *
 * `transport` is injected so this can be tested without a network: it takes
 * ({ messages, tools }) and returns an assistant message.
 */
export async function runToolLoop({
  messages, transport, toolbox, maxTurns = 4,
}) {
  const history = [...messages];
  const calls = [];

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const reply = await transport({ messages: history, tools: TOOL_SCHEMAS });
    history.push(reply);

    const wanted = reply.tool_calls || [];
    if (wanted.length === 0) {
      return { answer: reply.content || "", calls, history, turns: turn + 1 };
    }

    for (const call of wanted) {
      const name = call.function?.name;
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        history.push({
          role: "tool", tool_call_id: call.id, name,
          content: JSON.stringify({ ok: false, reason: "arguments were not valid JSON" }),
        });
        calls.push({ name, args: null, result: { ok: false }, badArguments: true });
        continue;
      }

      const fn = toolbox[name];
      let result;
      if (!fn) {
        result = { ok: false, reason: `no such tool: ${name}` };
      } else {
        try {
          result = await fn(args);
        } catch (err) {
          result = { ok: false, reason: String(err.message) };
        }
      }
      calls.push({ name, args, result });
      history.push({
        role: "tool", tool_call_id: call.id, name, content: JSON.stringify(result),
      });
    }
  }

  return {
    answer: "I could not finish that. Try asking a simpler question.",
    calls, history, turns: maxTurns, exhausted: true,
  };
}
