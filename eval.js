// ---------------------------------------------------------------------------
//  IN-BROWSER EVALUATION
// ---------------------------------------------------------------------------
//  The same scoring as tests/run_eval.js, running in the page, so that you can
//  measure your chat without installing anything or opening a terminal.
// ---------------------------------------------------------------------------

import * as cfg from "./config.js";
import { retrieve, buildContext, RETRIEVAL_METHOD } from "./lib/retrieve_vector.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const contains = (t, ns) =>
  ns.some((n) => String(t).toLowerCase().includes(String(n).toLowerCase()));

let LAST = null;

async function run() {
  $("#run").disabled = true;
  $("#status").textContent = "loading your chunks and questions";
  $("#detail").innerHTML = "";
  $("#scores").hidden = true;
  $("#copywrap").hidden = true;

  let chunks, set, vectoriser = null;
  try {
    const doc = await (await fetch("chunks.json")).json();
    chunks = doc.chunks || [];
    vectoriser = doc.vectoriser || null;
    set = (await (await fetch("questions.json")).json()).questions;
  } catch (err) {
    $("#status").textContent = `Could not load chunks.json or questions.json: ${err.message}`;
    $("#run").disabled = false;
    return;
  }

  const bar = $("#bar");
  bar.hidden = false;
  bar.max = set.length;
  bar.value = 0;

  const rows = [];
  let found = 0, correct = 0, rrSum = 0, wasteSum = 0, wasteN = 0, charSum = 0;
  const buckets = {};

  for (const item of set) {
    $("#status").textContent = `question ${item.id} of ${set.length}`;
    const passages = retrieve(item.q, chunks, {
      passages: cfg.PASSAGES, floor: cfg.SIMILARITY_FLOOR,
      vectoriser,
    });
    const { context } = buildContext(passages, cfg.MAX_CONTEXT_CHARS);
    charSum += context.length;

    // retrieval metrics
    const want = item.expect_any || [];
    let rr = 0, hit = false;
    if (want.length === 0) {
      hit = passages.length === 0;
      rr = hit ? 1 : 0;
    } else {
      const at = passages.findIndex((p) => contains(p.text, want));
      hit = at > -1;
      rr = hit ? 1 / (at + 1) : 0;
      const total = passages.reduce((n, p) => n + p.text.length, 0);
      if (total) {
        const useful = passages.filter((p) => contains(p.text, want))
          .reduce((n, p) => n + p.text.length, 0);
        wasteSum += (total - useful) / total;
        wasteN += 1;
      }
    }
    if (hit) found += 1;
    rrSum += rr;

    let data;
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: item.q, passages, context }),
      });
      data = await res.json();
    } catch (err) {
      data = { answer: `(request failed: ${err.message})`, blocked: true };
    }

    let ok, why;
    if (item.kind === "must_refuse") {
      ok = Boolean(data.blocked) || data.answer === cfg.OFF_TOPIC_REPLY;
      why = ok ? "refused" : "answered anyway";
    } else if (data.blocked) {
      ok = false; why = `blocked: ${data.blockedBy || "no relevant passage"}`;
    } else {
      ok = contains(data.answer || "", want);
      why = ok ? "fact present" : "fact missing from answer";
    }
    if (ok) correct += 1;

    buckets[item.kind] = buckets[item.kind] || [0, 0];
    buckets[item.kind][1] += 1;
    if (ok) buckets[item.kind][0] += 1;

    rows.push({ ...item, hit, ok, why, answer: data.answer || "",
                ids: passages.map((p) => p.id).join(" ") || "nothing" });
    bar.value = item.id;
  }

  const n = set.length;
  const mrr = rrSum / n;
  const waste = wasteN ? wasteSum / wasteN * 100 : 0;
  const chars = Math.round(charSum / n);

  LAST = {
    method: RETRIEVAL_METHOD,
    found: `${found}/${n} (${(found / n * 100).toFixed(1)}%)`,
    mrr: mrr.toFixed(3),
    waste: `${waste.toFixed(1)}%`,
    chars,
    graded: `${correct}/${n} (${(correct / n * 100).toFixed(1)}%)`,
    buckets,
    settings: `PASSAGES=${cfg.PASSAGES} FLOOR=${cfg.SIMILARITY_FLOOR} `
      + `MAX_CONTEXT_CHARS=${cfg.MAX_CONTEXT_CHARS}`,
    files: cfg.CONTENT_FILES.join(", "),
  };

  $("#scores").innerHTML = [
    ["retrieval found the fact", LAST.found],
    ["retrieval MRR", LAST.mrr],
    ["context waste", LAST.waste],
    ["chars per question", LAST.chars],
    ["graded correct", LAST.graded],
  ].map(([k, v]) => `<div class="score"><div class="n">${v}</div>
       <div class="k">${k}</div></div>`).join("");
  $("#scores").hidden = false;

  const bucketRows = Object.entries(buckets)
    .map(([k, [a, b]]) => `<tr><td>${esc(k)}</td><td>${a}/${b}</td></tr>`).join("");

  $("#detail").innerHTML = `
    <h3 style="margin-top:26px">By question type</h3>
    <table class="q"><thead><tr><th>kind</th><th>correct</th></tr></thead>
      <tbody>${bucketRows}</tbody></table>
    <h3 style="margin-top:26px">Every question</h3>
    <table class="q">
      <thead><tr><th>#</th><th>question</th><th>retrieved</th>
        <th>found</th><th>graded</th><th>note</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${r.id}</td><td>${esc(r.q)}</td><td>${esc(r.ids)}</td>
        <td class="${r.hit ? "ok" : "no"}">${r.hit ? "yes" : "no"}</td>
        <td class="${r.ok ? "ok" : "no"}">${r.ok ? "ok" : "FAIL"}</td>
        <td>${esc(r.why)}</td></tr>`).join("")}</tbody></table>`;

  $("#status").textContent = "done";
  $("#run").disabled = false;
  $("#copywrap").hidden = false;
}

function asText() {
  if (!LAST) return "";
  const b = Object.entries(LAST.buckets)
    .map(([k, [a, n]]) => `  ${k.padEnd(13)} ${a}/${n}`).join("\n");
  return [
    `retrieval method         : ${LAST.method}`,
    `content files indexed    : ${LAST.files}`,
    `settings                 : ${LAST.settings}`,
    ``,
    `retrieval found the fact : ${LAST.found}`,
    `retrieval MRR            : ${LAST.mrr}`,
    `mean context waste       : ${LAST.waste}`,
    `mean chars per question  : ${LAST.chars}`,
    `graded correct           : ${LAST.graded}`,
    ``,
    `by question type:`,
    b,
  ].join("\n");
}

$("#run").addEventListener("click", run);
$("#copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(asText());
    $("#copied").textContent = "copied";
  } catch {
    $("#copied").textContent = "could not copy, select the numbers above instead";
  }
  setTimeout(() => { $("#copied").textContent = ""; }, 2500);
});
