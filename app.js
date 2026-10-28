// ---------------------------------------------------------------------------
//  BROWSER SIDE
// ---------------------------------------------------------------------------
//  Loads your chunks, retrieves passages for the question, posts them to
//  /api/chat, and draws the answer plus the trace.
//
//  Retrieval happens HERE, in the browser. Generation happens on the server,
//  because that is where the API key lives.
// ---------------------------------------------------------------------------

import * as cfg from "./config.js";
import { retrieve, buildContext, RETRIEVAL_METHOD } from "./lib/retrieve_vector.js";

const $ = (sel) => document.querySelector(sel);

const SUGGESTED = [
  "Where are you based?",
  "What did you work on at Ada Innovate?",
  "What is your notice period?",
  "Who won the world cup?",
];

let CHUNKS = [];
let VECTORISER = null;

// --- tiny markdown render, headings and paragraphs only --------------------
function renderMarkdown(md) {
  return md
    .split("\n\n")
    .map((block) => {
      const t = block.trim();
      if (!t) return "";
      if (t.startsWith("## ")) return `<h3>${esc(t.slice(3))}</h3>`;
      if (t.startsWith("# ")) return `<h4>${esc(t.slice(2))}</h4>`;
      return `<p>${esc(t.replace(/\s*\n\s*/g, " "))}</p>`;
    })
    .join("\n");
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// --- trace rendering ------------------------------------------------------
function renderTrace(trace) {
  const rows = (trace.retrieval || [])
    .map(
      (r) =>
        `<tr><td>${r.score ?? ""}</td><td>${esc(r.id)}</td>` +
        `<td>${esc(r.heading || "")}</td><td>${r.chars}</td></tr>`
    )
    .join("");

  const retrievalTable = rows
    ? `<table><thead><tr><th>score</th><th>chunk</th><th>heading</th>
       <th>chars</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="fail">No passage scored above SIMILARITY_FLOOR
       (${cfg.SIMILARITY_FLOOR}).</p>`;

  const guards = (trace.guardrails || [])
    .map(
      (g) =>
        `<div class="${g.ok ? "pass" : "fail"}">` +
        `${g.ok ? "pass" : "FAIL"}  ${esc(g.rule)} — ${esc(g.detail)}</div>`
    )
    .join("");

  const t = trace.tokens || {};
  const tokenLines = [
    ["characters sent", t.promptCharsSent],
    ["tokens estimated", t.promptTokensEstimated],
    ["tokens actual (prompt)", t.promptTokensActual],
    ["tokens actual (answer)", t.completionTokensActual],
  ]
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `<div>${k}: ${v}</div>`)
    .join("");

  return `
    <div class="trace-h">Retrieved (${RETRIEVAL_METHOD})</div>
    ${retrievalTable}
    <div class="trace-h">Guardrails</div>${guards}
    <div class="trace-h">Context window</div>
    <div>MAX_CONTEXT_CHARS: ${cfg.MAX_CONTEXT_CHARS}</div>
    ${tokenLines}
    <div class="trace-h">Mode</div><div>${esc(trace.mode || "unknown")}</div>
  `;
}

// --- one question ---------------------------------------------------------
async function ask(question) {
  const tpl = $("#turn-template").content.cloneNode(true);
  const turn = tpl.querySelector(".turn");
  turn.querySelector(".q").textContent = question;
  turn.querySelector(".a").textContent = "Thinking…";
  $("#thread").append(turn);

  const passages = retrieve(question, CHUNKS, {
    passages: cfg.PASSAGES,
    floor: cfg.SIMILARITY_FLOOR,
    vectoriser: VECTORISER,
  });
  const { context, droppedForSpace } = buildContext(
    passages,
    cfg.MAX_CONTEXT_CHARS
  );

  let data;
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, passages, context }),
    });
    data = await res.json();
  } catch (err) {
    turn.querySelector(".a").textContent = `Could not reach /api/chat: ${err.message}`;
    turn.querySelector(".a").classList.add("blocked");
    return;
  }

  const answerEl = turn.querySelector(".a");
  if (data.error) {
    answerEl.textContent = data.error;
    answerEl.classList.add("blocked");
  } else {
    answerEl.textContent = data.answer;
    if (data.blocked) answerEl.classList.add("blocked");
  }

  // sources: always visible under the answer, no need to open the panel
  const used = (data.trace && data.trace.retrieval) || [];
  const srcEl = document.createElement("div");
  srcEl.className = "sources";
  srcEl.style.cssText = "font-size:0.85em;opacity:0.8;margin-top:6px;";
  srcEl.textContent = used.length
    ? "Sources: " +
      used
        .map((r) => `${r.id} (${r.heading || "no heading"}, score ${r.score})`)
        .join("; ")
    : "Sources: none, no passage scored above the similarity floor.";
  answerEl.insertAdjacentElement("afterend", srcEl);

  if (cfg.SHOW_TRACE && data.trace) {
    let html = renderTrace(data.trace);
    if (droppedForSpace > 0) {
      html += `<div class="trace-h">Dropped for space</div>
               <div class="fail">${droppedForSpace} passage(s) did not fit in
               MAX_CONTEXT_CHARS</div>`;
    }
    turn.querySelector(".trace-body").innerHTML = html;
  } else {
    turn.querySelector(".trace").remove();
  }
}

// --- startup --------------------------------------------------------------
async function start() {
  $("#owner-name").textContent = cfg.OWNER_NAME;
  $("#headline").textContent = cfg.HEADLINE;
  document.title = `${cfg.OWNER_NAME} — ${cfg.HEADLINE}`;

  // chunks
  try {
    const doc = await (await fetch("chunks.json")).json();
    CHUNKS = doc.chunks || [];
    VECTORISER = doc.vectoriser || null;
    $("#foot-note").textContent =
      `${CHUNKS.length} chunks, built ${doc.built_at}, strategy "${doc.strategy}".`;
  } catch {
    $("#foot-note").textContent =
      "chunks.json did not load. Run the prep notebook and commit the file.";
  }

  // readable background section
  const parts = [];
  for (const name of cfg.CONTENT_FILES) {
    try {
      const md = await (await fetch(`content/${name}`)).text();
      parts.push(renderMarkdown(md));
    } catch {
      parts.push(`<p>Could not load content/${esc(name)}.</p>`);
    }
  }
  $("#content-render").innerHTML = parts.join("\n") || "<p>No notes loaded.</p>";

  // suggestion chips
  $("#suggestions").innerHTML = SUGGESTED.map(
    (q) => `<button type="button">${esc(q)}</button>`
  ).join("");
  $("#suggestions").addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") {
      $("#question").value = e.target.textContent;
      $("#ask-form").requestSubmit();
    }
  });

  $("#ask-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = $("#question").value.trim();
    if (!q) return;
    $("#ask-button").disabled = true;
    $("#question").value = "";
    try {
      await ask(q);
    } finally {
      $("#ask-button").disabled = false;
      $("#question").focus();
    }
  });
}

start();
