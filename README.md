# NutriSnap — Vercel-ready AI Food Analyzer

NutriSnap lets you upload a food photo and get an AI-estimated health score, calories, macros, vitamins/minerals, positives, and watch-outs.

This version supports two runtimes:

- **Vercel:** Express runs as a Vercel Function and calls Google's hosted Gemma API.
- **Local:** You can keep using Ollama + Gemma 3 on your own computer.

## Why the Vercel version is different

The original app sends requests to `http://127.0.0.1:11434`, which only works when Ollama is running on the same computer as Node.js. A Vercel Function cannot run your local Ollama server or bundle a multi-gigabyte Gemma model as a normal web process.

This version uses the hosted Gemma API when deployed, while preserving Ollama as a local fallback.

It also compresses images in the browser before upload so requests stay below Vercel's Function payload limit.

## Deploy to Vercel (free hosting)

### 1. Get a Google AI Studio API key

Create an API key in Google AI Studio.

For current deployments, the default model in this project is:

```text
gemma-4-26b-a4b-it
```

If your Google AI project still exposes Gemma 3 and you want to keep using it, set:

```text
GEMMA_MODEL=gemma-3-27b-it
```

Gemma API free-tier availability and quotas are controlled by Google and can change over time.

### 2. Import this GitHub repository into Vercel

In Vercel:

1. Click **Add New → Project**.
2. Import your GitHub repository.
3. Vercel should detect the project as **Express**.
4. You do not need a custom build command.
5. Keep the project root as the repository root.

### 3. Add environment variables

In **Vercel → Project → Settings → Environment Variables**, add:

```text
GEMINI_API_KEY=your_google_ai_studio_api_key
AI_PROVIDER=gemini
GEMMA_MODEL=gemma-4-26b-a4b-it
```

`AI_PROVIDER` and `GEMMA_MODEL` are optional because the app has sensible defaults, but explicitly setting them makes the deployment easier to understand.

Never put `GEMINI_API_KEY` in `public/app.js`, `index.html`, or any browser code.

### 4. Deploy

Redeploy the project after adding the environment variable.

Your app will use:

```text
Browser → /api/analyze → Vercel Express Function → Google Gemma API
```

## Check the deployment

Open:

```text
https://YOUR-APP.vercel.app/api/health
```

A correctly configured Vercel deployment should return something similar to:

```json
{
  "ok": true,
  "provider": "gemini",
  "model": "gemma-4-26b-a4b-it",
  "configured": true
}
```

If `configured` is `false`, add `GEMINI_API_KEY` in Vercel and redeploy.

## Run locally with the hosted Gemma API

```bash
npm install
GEMINI_API_KEY=your_key npm start
```

Then open:

```text
http://localhost:3000
```

## Run locally with Ollama + Gemma 3

Install/pull the model:

```bash
ollama pull gemma3:4b
```

Then run:

```bash
AI_PROVIDER=ollama npm start
```

By default, local Ollama uses:

```text
http://127.0.0.1:11434
```

To change it:

```bash
AI_PROVIDER=ollama OLLAMA_URL=http://YOUR-OLLAMA-HOST:11434 npm start
```

To use another local model:

```bash
AI_PROVIDER=ollama OLLAMA_MODEL=gemma3:12b npm start
```

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio / Gemini Developer API key | none |
| `GEMMA_MODEL` | Hosted Gemma model | `gemma-4-26b-a4b-it` |
| `AI_PROVIDER` | `gemini` or `ollama` | Gemini on Vercel; Gemini when a key is present; otherwise Ollama locally |
| `OLLAMA_URL` | Local/remote Ollama endpoint | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Ollama model | `gemma3:4b` |

## Important notes

- Food nutrition is estimated from an image and can be wrong.
- Hidden ingredients, oil, sauces, portion size, and preparation method may not be visible.
- This is not an official European Nutri-Score and is not medical advice.
- In hosted mode, the photo is sent to the configured AI provider. Review that provider's current privacy/data-use terms before using the app with sensitive images.
