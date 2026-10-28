// ---------------------------------------------------------------------------
//  THE SERVERLESS FUNCTION
// ---------------------------------------------------------------------------
//  Lives at /api/chat on your deployed site. You should not need to edit this.
//
//  It receives a question and the passages your browser already retrieved,
//  builds the prompt, calls the model, checks the answer, and returns both the
//  answer and a trace of what happened.
//
//  The API key is read from the environment here, on the server. It is never
//  sent to the browser. That is the whole reason this file exists.
// ---------------------------------------------------------------------------

import * as cfg from "../config.js";
import { checkQuestion, checkHasContext, checkAnswer } from "../lib/guard.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_POSTED_CONTEXT = 20000; // refuse oversized payloads

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/** Rough token estimate. Four characters per token is close enough to reason with. */
export const estimateTokens = (text) => Math.ceil((text || "").length / 4);

/** Build the two messages we send to the model. */
export function buildMessages(question, context, systemPrompt, ownerName) {
  const system =
    `${systemPrompt.trim()}\n\n` +
    `The person is ${ownerName}.\n\n` +
    `NOTES:\n${context}`;
  return [
    { role: "system", content: system },
    { role: "user", content: question },
  ];
}

/**
 * No key configured: answer extractively.
 *
 * This is a real baseline, not a placeholder. It scores every sentence in the
 * retrieved passages against the question and returns the best two. That is
 * roughly what retrieval alone can do without a model, so the gap between
 * this score and your scored run with a key is what the model is adding.
 */
export function demoAnswer(passages, question = "") {
  if (!passages.length) return "I do not have a note that covers that.";

  const words = (t) =>
    new Set(
      String(t).toLowerCase().replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/).filter((w) => w.length > 2)
    );
  const q = words(question);

  const sentences = [];
  for (const p of passages) {
    for (const raw of String(p.text).split(/(?<=[.!?])\s+/)) {
      const s = raw.trim();
      if (s.length < 15) continue;
      const sw = words(s);
      let shared = 0;
      for (const w of q) if (sw.has(w)) shared += 1;
      sentences.push({ s, heading: p.heading, score: shared / Math.sqrt(sw.size || 1) });
    }
  }
  if (!sentences.length) return "I do not have a note that covers that.";

  sentences.sort((a, b) => b.score - a.score);
  const top = sentences.slice(0, 2);
  if (top[0].score === 0) {
    return "I do not have a note that covers that.";
  }
  return `[DEMO MODE, no API key set] ${top.map((t) => t.s).join(" ")}`;
}

async function callGroq(messages, apiKey, { model, temperature }) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, temperature, messages, max_tokens: 400 }),
  });

  if (res.status === 429) {
    const wait = res.headers.get("retry-after");
    throw Object.assign(
      new Error(
        `Rate limited by Groq. Wait ${wait || "a few"} seconds and ask again.`
      ),
      { status: 429 }
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw Object.assign(
      new Error(`Groq returned ${res.status}: ${body.slice(0, 300)}`),
      { status: 502 }
    );
  }
  const data = await res.json();
  return {
    answer: data.choices?.[0]?.message?.content?.trim() || "",
    usage: data.usage || null,
  };
}

export default {
  async fetch(request) {
    if (request.method === "GET") {
      return json({
        ok: true,
        owner: cfg.OWNER_NAME,
        model: cfg.MODEL,
        keyConfigured: Boolean(process.env.GROQ_API_KEY),
        retrievalDoneBy: "browser",
      });
    }
    if (request.method !== "POST") {
      return json({ error: "Use POST." }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Body must be JSON." }, 400);
    }

    const question = String(body.question || "");
    const passages = Array.isArray(body.passages) ? body.passages : [];
    const context = String(body.context || "");

    if (context.length > MAX_POSTED_CONTEXT) {
      return json({ error: "Context too large." }, 413);
    }

    const trace = {
      question,
      retrieval: passages.map((p) => ({
        id: p.id,
        heading: p.heading,
        score: p.score,
        chars: (p.text || "").length,
      })),
      guardrails: [],
      tokens: {},
      mode: null,
    };

    // --- checks before we spend a model call -----------------------------
    const qCheck = checkQuestion(question);
    trace.guardrails.push(qCheck);
    if (!qCheck.ok) {
      return json({ answer: cfg.OFF_TOPIC_REPLY, blocked: true, trace });
    }

    const cCheck = checkHasContext(passages);
    trace.guardrails.push(cCheck);
    if (!cCheck.ok) {
      return json({ answer: cfg.OFF_TOPIC_REPLY, blocked: true, trace });
    }

    const messages = buildMessages(
      question,
      context,
      cfg.SYSTEM_PROMPT,
      cfg.OWNER_NAME
    );
    const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
    trace.tokens.promptCharsSent = promptChars;
    trace.tokens.promptTokensEstimated = estimateTokens(
      messages.map((m) => m.content).join("")
    );

    // --- the model call --------------------------------------------------
    let answer;
    const apiKey = process.env.GROQ_API_KEY;
    try {
      if (!apiKey) {
        trace.mode = "demo";
        answer = demoAnswer(passages, question);
      } else {
        trace.mode = "groq";
        const out = await callGroq(messages, apiKey, {
          model: cfg.MODEL,
          temperature: cfg.TEMPERATURE,
        });
        answer = out.answer;
        if (out.usage) {
          trace.tokens.promptTokensActual = out.usage.prompt_tokens;
          trace.tokens.completionTokensActual = out.usage.completion_tokens;
          trace.tokens.totalTokensActual = out.usage.total_tokens;
        }
      }
    } catch (err) {
      return json({ error: err.message, trace }, err.status || 500);
    }

    // --- checks on what came back ----------------------------------------
    const post = checkAnswer(answer, context, cfg.BANNED_PHRASES);
    trace.guardrails.push(...post.results);
    if (!post.ok) {
      return json({
        answer: cfg.OFF_TOPIC_REPLY,
        blocked: true,
        blockedBy: post.failed.rule,
        rawAnswer: answer,
        trace,
      });
    }

    return json({ answer, blocked: false, trace });
  },
};
