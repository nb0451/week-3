"""
Turn the markdown files in content/ into chunks.json.

This is the Colab half of the assignment. Chunking is a text problem, so it
belongs in Python, and the choices you make here change the answers more than
anything you will do to the prompt.

Three strategies:
  whole    one chunk per file. Simple and usually bad.
  heading  split on '## ' headings. The default.
  window   fixed character windows with overlap. Ignores document structure.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

CONTENT_DIR = "content"


def read_files(filenames):
    out = {}
    for name in filenames:
        path = os.path.join(CONTENT_DIR, name)
        with open(path, encoding="utf-8") as fh:
            out[name] = fh.read()
    return out


def normalise(text):
    """Collapse single newlines inside a paragraph, keep paragraph breaks."""
    text = text.replace("\r\n", "\n")
    paras = [re.sub(r"\s*\n\s*", " ", p).strip() for p in text.split("\n\n")]
    return "\n\n".join(p for p in paras if p)


def chunk_whole(name, text):
    body = normalise(re.sub(r"^#\s+.*\n", "", text, count=1))
    return [{"file": name, "heading": name.replace(".md", ""), "text": body}]


def chunk_heading(name, text):
    """Split on '## '. Text before the first '## ' is kept as its own chunk."""
    text = re.sub(r"^#\s+.*\n", "", text, count=1)
    parts = re.split(r"^##\s+(.+)$", text, flags=re.MULTILINE)
    chunks = []
    preamble = normalise(parts[0])
    if preamble:
        chunks.append({"file": name, "heading": name.replace(".md", ""),
                       "text": preamble})
    for i in range(1, len(parts), 2):
        heading = parts[i].strip()
        body = normalise(parts[i + 1]) if i + 1 < len(parts) else ""
        if body:
            chunks.append({"file": name, "heading": heading,
                           "text": heading + ". " + body})
    return chunks


def chunk_window(name, text, size=600, overlap=150):
    body = normalise(re.sub(r"^#\s+.*\n", "", text, count=1))
    flat = body.replace("\n\n", " ")
    step = size - overlap
    if step <= 0:
        raise ValueError("overlap must be smaller than size")
    chunks = []
    for start in range(0, max(len(flat), 1), step):
        piece = flat[start:start + size].strip()
        if len(piece) < 80:
            continue
        chunks.append({"file": name, "heading": name.replace(".md", ""),
                       "text": piece})
        if start + size >= len(flat):
            break
    return chunks


STRATEGIES = {"whole": chunk_whole, "heading": chunk_heading,
              "window": chunk_window}


def build(filenames, strategy="heading"):
    if strategy not in STRATEGIES:
        raise ValueError(f"unknown strategy {strategy!r}; "
                         f"pick one of {sorted(STRATEGIES)}")
    fn = STRATEGIES[strategy]
    chunks, counter = [], {}
    for name, text in read_files(filenames).items():
        for ch in fn(name, text):
            stem = name.replace(".md", "")
            counter[stem] = counter.get(stem, 0) + 1
            ch["id"] = f"{stem}-{counter[stem]}"
            ch["chars"] = len(ch["text"])
            chunks.append(ch)
    return {
        "strategy": strategy,
        "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": list(filenames),
        "chunks": chunks,
    }


def report(doc):
    chunks = doc["chunks"]
    sizes = [c["chars"] for c in chunks]
    print(f"strategy   : {doc['strategy']}")
    print(f"files      : {len(doc['files'])}")
    print(f"chunks     : {len(chunks)}")
    if sizes:
        print(f"chars      : min {min(sizes)}, mean {sum(sizes)//len(sizes)}, "
              f"max {max(sizes)}")
    by_file = {}
    for c in chunks:
        by_file[c["file"]] = by_file.get(c["file"], 0) + 1
    for name in doc["files"]:
        print(f"  {name:<18} {by_file.get(name, 0)} chunks")


if __name__ == "__main__":
    strategy = sys.argv[1] if len(sys.argv) > 1 else "heading"
    files = ["about.md", "experience.md", "projects.md", "skills.md"]
    if "--with-faq" in sys.argv:
        files.append("faq.md")
    doc = build(files, strategy)
    report(doc)
    out = sys.argv[sys.argv.index("-o") + 1] if "-o" in sys.argv else "chunks.json"
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=1, ensure_ascii=False)
    print(f"\nwrote {out}")
