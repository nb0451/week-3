"""
Turn chunks.json into vectors.

Reads the chunks produced by prep.py, fits a TF-IDF vectoriser over them, and
writes the vocabulary, the IDF weights and one sparse vector per chunk into a
new file. The browser then builds a vector for the question using the same
vocabulary and ranks by cosine similarity.

This is the same TfidfVectorizer you used in Week 1 for the news classifier.
The difference is that here you keep the vectoriser's vocabulary so that
something other than Python can use it.
"""

import json
import sys

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer


def vectorise(doc, min_df=1, sublinear_tf=True, stop_words="english"):
    texts = [c["text"] for c in doc["chunks"]]

    # stop_words matters more than anything else here. scikit-learn removes no
    # stopwords by default, and on a corpus this small IDF cannot tell "are"
    # apart from "based" (2.00 against 2.85). Leave them in and the question
    # "Where are you based?" spends 60% of its vector on "where", "are", "you".
    vec = TfidfVectorizer(
        lowercase=True,
        sublinear_tf=sublinear_tf,
        smooth_idf=True,
        norm="l2",
        min_df=min_df,
        stop_words=stop_words,
        token_pattern=r"(?u)\b\w\w+\b",
    )
    matrix = vec.fit_transform(texts)

    vocab = {term: int(i) for term, i in vec.vocabulary_.items()}
    idf = [float(x) for x in vec.idf_]

    out = dict(doc)
    out["vectoriser"] = {
        "kind": "tfidf",
        "stop_words": stop_words,
        "sublinear_tf": sublinear_tf,
        "smooth_idf": True,
        "norm": "l2",
        "token_pattern": r"\b\w\w+\b",
        "vocab_size": len(vocab),
        "vocab": vocab,
        "idf": idf,
    }

    chunks = []
    for c, row in zip(doc["chunks"], matrix):
        coo = row.tocoo()
        chunks.append({
            **c,
            "vec": {str(int(j)): round(float(v), 7)
                    for j, v in zip(coo.col, coo.data)},
        })
    out["chunks"] = chunks
    return out, vec, matrix


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "chunks.json"
    dst = sys.argv[sys.argv.index("-o") + 1] if "-o" in sys.argv else "chunks.json"

    with open(src, encoding="utf-8") as fh:
        doc = json.load(fh)

    out, vec, matrix = vectorise(doc)

    print(f"chunks      : {len(out['chunks'])}")
    print(f"vocabulary  : {out['vectoriser']['vocab_size']} terms")
    print(f"matrix      : {matrix.shape[0]} x {matrix.shape[1]}, "
          f"{matrix.nnz} non-zero ({matrix.nnz / matrix.shape[0]:.1f} per chunk)")
    print(f"idf range   : {min(out['vectoriser']['idf']):.4f} "
          f"to {max(out['vectoriser']['idf']):.4f}")

    # a reference cosine, computed here in Python, so the JS side can be checked
    probe = "Where are you based?"
    q = vec.transform([probe])
    sims = (matrix @ q.T).toarray().ravel()
    order = np.argsort(-sims)[:3]
    print(f"\nreference cosines for {probe!r} (computed in Python):")
    for i in order:
        print(f"  {sims[i]:.7f}  {out['chunks'][i]['id']}")

    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
    print(f"\nwrote {dst}")
