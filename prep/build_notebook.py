"""Assemble prep.ipynb from the real Python sources so they cannot drift."""
import json, re, sys

def body(path):
    """Read a module and drop its __main__ block and module docstring."""
    src = open(path, encoding="utf-8").read()
    src = re.sub(r'^""".*?"""\n+', "", src, flags=re.DOTALL)
    src = re.split(r'\nif __name__ == "__main__":', src)[0]
    return src.rstrip() + "\n"

def cell(kind, text):
    lines = text.split("\n")
    # every line must end in \n except the last; this is what makes a notebook
    # render as separate lines instead of one unreadable blob
    src = [l + "\n" for l in lines[:-1]] + ([lines[-1]] if lines[-1] else [])
    c = {"cell_type": kind, "metadata": {}, "source": src}
    if kind == "code":
        c["outputs"] = []
        c["execution_count"] = None
    return c

CHUNKER = body("prep/prep.py")
VECTORISER = body("prep/vectorise.py")

cells = []
A = cells.append

A(cell("markdown", """# Week 3 — build your chunks

This notebook turns your notes into the `chunks.json` file your site reads.

**Everyone** runs sections 1 to 4.
**Option B and above** also run sections 5 to 7.

Nothing here costs money and nothing needs an API key."""))

A(cell("markdown", """## 1. Get your notes into Colab

Run the cell below and pick your five markdown files from `content/`:
`about.md`, `experience.md`, `projects.md`, `skills.md`, `faq.md`.

If you have not written them yet, run it and press Cancel. It will write a
small sample set instead so you can see the whole notebook work, then you can
come back later with your own."""))

A(cell("code", '''import os, json, textwrap

os.makedirs("content", exist_ok=True)
NEEDED = ["about.md", "experience.md", "projects.md", "skills.md", "faq.md"]

uploaded = {}
try:
    from google.colab import files          # only exists inside Colab
    print("Pick your markdown files (Cancel to use the sample set).")
    uploaded = files.upload()
except Exception as e:
    print(f"Not running in Colab ({type(e).__name__}). Looking for local files.")

for name, data in uploaded.items():
    with open(os.path.join("content", name), "wb") as fh:
        fh.write(data)
    print(f"saved content/{name}")

missing = [n for n in NEEDED if not os.path.exists(os.path.join("content", n))]
if missing:
    print(f"\\nMissing {missing}, writing a sample set so the notebook runs.")
    SAMPLE = {
        "about.md": "# About\\n\\nI am Sample Person, an AI engineer. I am based in "
                    "Bangalore, India, and I work remotely.\\n",
        "experience.md": "# Experience\\n\\n## AI Engineer, Northwind Data\\n\\nI own the "
                    "retrieval layer of a support assistant. Splitting documents on "
                    "headings instead of a fixed character count was worth 14 points "
                    "of accuracy on its own.\\n",
        "projects.md": "# Projects\\n\\n## News triage assistant\\n\\nSorts a news item "
                    "into one of four categories and records every run so the "
                    "behaviour can be scored.\\n",
        "skills.md": "# Skills\\n\\n## Languages\\n\\nPython is my main language. "
                    "JavaScript second.\\n",
        "faq.md": "# Frequently asked\\n\\n## What is your notice period?\\n\\n"
                    "Thirty days.\\n",
    }
    for n in missing:
        with open(os.path.join("content", n), "w", encoding="utf-8") as fh:
            fh.write(SAMPLE[n])

print("\\ncontent/ now holds:")
for n in sorted(os.listdir("content")):
    print(f"  {n:<16} {os.path.getsize(os.path.join('content', n))} bytes")'''))

A(cell("markdown", """## 2. The chunker

Three strategies. Read them before you run them, because the choice you make
here changes the answers more than anything you will do to the prompt.

- `whole` — one chunk per file. Simple, and usually the worst.
- `heading` — split on `## ` headings. Follows the shape of the document.
- `window` — fixed character windows with overlap. Ignores structure entirely."""))

A(cell("code", CHUNKER))

A(cell("markdown", """## 3. Try all three and look at the difference

This prints the shape of each strategy. There is no single right answer, but
there is a wrong one: whichever produces chunks so large that every answer
drags in text about something else."""))

A(cell("code", '''FILES = ["about.md", "experience.md", "projects.md", "skills.md"]

for name in STRATEGIES:
    doc = build(FILES, name)
    print("=" * 60)
    report(doc)
    print()'''))

A(cell("markdown", """## 4. Write chunks.json

Change `STRATEGY` below if you want a different one, then run it. The last
line downloads the file. Put it in the root of your repository, next to
`index.html`, and commit it.

**Note which files are in the list.** `faq.md` is deliberately left out, to
match `config.js`. Three of the questions in `questions.json` can only be
answered from it. Your Option A task is to find that out by measurement, not
by reading this comment."""))

A(cell("code", '''STRATEGY = "heading"
FILES = ["about.md", "experience.md", "projects.md", "skills.md"]

doc = build(FILES, STRATEGY)
report(doc)

with open("chunks.json", "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=1, ensure_ascii=False)
print("\\nwrote chunks.json")

try:
    from google.colab import files
    files.download("chunks.json")
except Exception:
    print("(not in Colab, so no download; the file is in this folder)")'''))

A(cell("markdown", """---

# Option B and above starts here

Everything above produced chunks of text. Everything below turns them into
vectors and then measures whether that actually helped."""))

A(cell("markdown", """## 5. Fit a TF-IDF vectoriser

This is the same `TfidfVectorizer` you used in Week 1 for the news classifier.
The difference is that this time you keep the vocabulary and the IDF weights,
and export them, so that JavaScript in the browser can build a vector for the
visitor's question using the same vocabulary.

**`stop_words` is the setting that matters most.** scikit-learn removes no
stopwords by default. Leave them in on a corpus this small and the question
"Where are you based?" spends most of its vector on "where", "are" and "you",
which appear in nearly every chunk. Worse, nonsense questions start matching
things, because "the" matches everywhere, and your refusal stops working.
Try it both ways in section 6 and you will see it."""))

A(cell("code", VECTORISER))

A(cell("code", '''doc = build(["about.md", "experience.md", "projects.md", "skills.md", "faq.md"],
            "heading")

out, vec, matrix = vectorise(doc, stop_words="english")
print(f"chunks     : {len(out['chunks'])}")
print(f"vocabulary : {out['vectoriser']['vocab_size']} terms")
print(f"idf range  : {min(out['vectoriser']['idf']):.4f} "
      f"to {max(out['vectoriser']['idf']):.4f}")

with open("chunks.json", "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=1, ensure_ascii=False)
print("\\nwrote chunks.json with vectors")

try:
    from google.colab import files
    files.download("chunks.json")
except Exception:
    print("(not in Colab, so no download)")'''))

A(cell("markdown", """## 6. Prove whether it helped

Retrieval offline, in Python, so you can compare methods without deploying
anything. Three numbers per method:

- **found** — did any returned chunk contain the answer at all
- **MRR** — how high up the ranking it was. 1.0 means always first
- **waste** — what fraction of the characters you are about to pay for sit in
  chunks that cannot answer the question

Run it with `stop_words=None` as well. Watch the last two questions, the ones
that should be refused, start getting answers."""))

A(cell("code", '''import numpy as np

QUESTIONS = [
    ("Where are you based?",                     ["bangalore"]),
    ("What is your main programming language?",   ["python"]),
    ("What is your notice period?",               ["thirty days"]),
    ("How soon could you start?",                 ["thirty days"]),
    ("What city do you live in?",                 ["bangalore"]),
    ("Who won the cricket world cup?",            []),
    ("What is the capital of Brazil?",            []),
]
PASSAGES, FLOOR = 3, 0.05


def rank(question, out, vec, matrix):
    q = vec.transform([question])
    sims = (matrix @ q.T).toarray().ravel()
    order = np.argsort(-sims)[:PASSAGES]
    return [(out["chunks"][i], float(sims[i])) for i in order
            if sims[i] > FLOOR]


def measure(stop_words):
    out, vec, matrix = vectorise(doc, stop_words=stop_words)
    found = rr = waste_sum = waste_n = 0
    print(f"  stop_words={stop_words!r}  vocab={out['vectoriser']['vocab_size']}")
    for q, expect in QUESTIONS:
        hits = rank(q, out, vec, matrix)
        if not expect:
            ok = len(hits) == 0
            found += ok
            rr += ok
            print(f"    {'ok  ' if ok else 'FAIL'} refuse  {q}")
            continue
        texts = [c["text"].lower() for c, _ in hits]
        pos = next((i for i, t in enumerate(texts)
                    if any(e in t for e in expect)), None)
        found += pos is not None
        rr += 0 if pos is None else 1 / (pos + 1)
        total = sum(len(c["text"]) for c, _ in hits)
        if total:
            useful = sum(len(c["text"]) for c, _ in hits
                         if any(e in c["text"].lower() for e in expect))
            waste_sum += (total - useful) / total
            waste_n += 1
        where = "nothing" if pos is None else f"rank {pos + 1}"
        print(f"    {'ok  ' if pos == 0 else 'ok  ' if pos is not None else 'FAIL'}"
              f" {where:<9} {q}")
    n = len(QUESTIONS)
    print(f"    found {found}/{n}   MRR {rr / n:.3f}   "
          f"waste {waste_sum / max(waste_n, 1) * 100:.1f}%\\n")


print("WITH stopword removal")
measure("english")
print("WITHOUT stopword removal")
measure(None)'''))

A(cell("markdown", """## 7. Optional: dense embeddings

Everything so far counts words. That has a hard ceiling, and section 6 shows
you where it is: "How soon could you start?" shares no word at all with "My
notice period is thirty days", so no amount of weighting will connect them.

Dense embeddings are the fix. The cell below computes them with
`sentence-transformers`, which downloads a model of roughly 90 MB the first
time and then runs on Colab's CPU in a few seconds.

**Two honest warnings.**

First, this is an offline comparison only. Serving dense embeddings from your
site needs the same model in the browser, which is a bigger change than this
assignment asks for. Measure the gain here, write it up, and ship the TF-IDF
version.

Second, I have not been able to run this cell in the environment where the
rest of this notebook was tested, because that machine has no access to the
model host. Everything above has verified numbers. This cell does not. If it
fails, that is worth reporting, and it does not affect your submission."""))

A(cell("code", '''# !pip install -q sentence-transformers

try:
    from sentence_transformers import SentenceTransformer
    import numpy as np

    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    texts = [c["text"] for c in doc["chunks"]]
    M = model.encode(texts, normalize_embeddings=True)
    print(f"embedded {M.shape[0]} chunks into {M.shape[1]} dimensions")

    found = rr = 0
    for q, expect in QUESTIONS:
        qv = model.encode([q], normalize_embeddings=True)
        sims = (M @ qv.T).ravel()
        order = np.argsort(-sims)[:PASSAGES]
        hits = [(doc["chunks"][i], float(sims[i])) for i in order
                if sims[i] > 0.15]
        if not expect:
            ok = len(hits) == 0
            found += ok; rr += ok
            print(f"  {'ok  ' if ok else 'FAIL'} refuse  {q}")
            continue
        pos = next((i for i, (c, _) in enumerate(hits)
                    if any(e in c["text"].lower() for e in expect)), None)
        found += pos is not None
        rr += 0 if pos is None else 1 / (pos + 1)
        print(f"  {'ok  ' if pos is not None else 'FAIL'} "
              f"{'nothing' if pos is None else 'rank ' + str(pos + 1):<9} {q}")
    n = len(QUESTIONS)
    print(f"\\n  dense: found {found}/{n}   MRR {rr / n:.3f}")
    print("  Compare against the TF-IDF numbers from section 6.")
except Exception as e:
    print(f"Dense embeddings did not run: {type(e).__name__}: {e}")
    print("Report this and move on. Your submission does not depend on it.")'''))

nb = {
    "cells": cells,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python",
                       "name": "python3"},
        "language_info": {"name": "python", "version": "3.11"},
        "colab": {"provenance": [], "toc_visible": True},
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}

with open("prep.ipynb", "w", encoding="utf-8") as fh:
    json.dump(nb, fh, indent=1, ensure_ascii=False)
print(f"wrote prep.ipynb  ({len(cells)} cells: "
      f"{sum(1 for c in cells if c['cell_type']=='code')} code, "
      f"{sum(1 for c in cells if c['cell_type']=='markdown')} markdown)")
