# Projects

## News triage assistant

A classifier and triage app for news items. It sorts an item into one of four
categories, decides whether a question needs explaining or refusing, retrieves
a relevant note from a small knowledge base, and records every run so the
behaviour can be scored afterwards.

The interesting part is the config file. The prompt, the routing rules, the
guardrails and the retrieval settings all live in one place in plain language,
so changing behaviour does not mean changing code. I built it that way after
watching non-engineers be unable to contribute to a system they understood
perfectly well.

Scored 56.7 percent accuracy with a Cohen's kappa of 0.42 on the first pass.
After fixing the prompt to name all four categories and to say what to do when
two categories both fit, it went to 83 percent.

Stack: Python, Gradio, SQLite, Groq.

## Text classification from scratch

A news topic classifier built without a framework: hand labelling, inter
annotator agreement, TF-IDF features, logistic regression, confusion matrix.

Two things surprised me. First, my own labels disagreed with a second labeller
about one time in five, which puts a hard ceiling on any accuracy claim.
Second, a deliberately leaky split scored 1.000 on a 200 row pool, which is how
I learned to be suspicious of a perfect number.

Stack: Python, scikit-learn, pandas.

## This portfolio

The site you are reading. A static page with a chat box that answers questions
about me from my own notes. Retrieval runs in the browser, generation runs in a
serverless function so the API key never reaches the client.

Stack: HTML, CSS, JavaScript, Vercel Functions, Groq.
