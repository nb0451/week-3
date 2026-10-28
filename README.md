# Portfolio with a chat that answers from your own notes

A static page plus one serverless function. Retrieval runs in the browser,
generation runs on the server, so your API key never reaches a visitor.

## Run it locally in two commands

```bash
node dev.js          # then open http://localhost:3000
npm test             # 49 tests
```

Or skip all of that: deploy it, then open `/eval` on your live site and press
the button. The same twenty questions, the same numbers, no terminal.

It works with no API key. Without one it answers extractively from your notes
and labels itself DEMO MODE, so you can see the whole thing working before you
sign up for anything.

## What to edit

| File | What it is |
|---|---|
| `content/*.md` | Your notes. This is the content the chat answers from |
| `config.js` | Every setting, in plain English. The only code file you need |
| `styles.css` | All the styling. Safe to hand to an AI tool and restyle |
| `chunks.json` | Built by `prep.ipynb`. Do not edit by hand |

Everything else is machinery.

## The one rule about your key

Your Groq key goes in exactly two places and nowhere else:

- `.env.local` on your own machine, which `.gitignore` already excludes
- Vercel, under Settings, Environment Variables

Never in `config.js`. Never in a notebook cell. Never in a screenshot, never
in the group chat, not even when you are asking for help. Blur it. If you ever
paste one by accident, go to the Groq console and revoke it immediately. A
leaked key is someone else's bill and your name on it.

## Deploy

1. Push this repository to your own GitHub account.
2. On vercel.com, New Project, import the repository.
3. Framework preset: Other. No build command. No output directory.
4. Add `GROQ_API_KEY` under Environment Variables.
5. Deploy, then open `/api/chat` on your live URL. It should report
   `"keyConfigured": true`.

## What is in here

```
index.html          the page
eval.html           in-browser scoring, no terminal needed
styles.css          the styling
app.js              browser: retrieve, call the function, draw the trace
eval.js             runs the 20 questions in the page and grades them
config.js           your settings
chunks.json         your notes, chunked, built by the notebook
content/            your notes as markdown
lib/retrieve.js     keyword retrieval
lib/retrieve_vector.js  TF-IDF retrieval (Option B swaps this in)
lib/guard.js        the four guardrails
api/chat.js         the serverless function
dev.js              local server, mimics Vercel's routing
prep.ipynb          the Colab notebook that builds chunks.json
prep/               the same chunking and vectorising code as plain .py
questions.json      the 20 question evaluation set
tests/              36 unit tests plus the evaluation harness
```

## Privacy

This becomes a public URL. Your email is enough. Leave your phone number and
your home address out of `content/`.
