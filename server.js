import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMMA_MODEL = (process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it').replace(/^models\//, '');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';
const AI_PROVIDER = (
  process.env.AI_PROVIDER ||
  (GEMINI_API_KEY ? 'gemini' : process.env.VERCEL ? 'gemini' : 'ollama')
).toLowerCase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Vercel Functions reject request payloads above 4.5 MB. Keep our parser below
// that limit; the browser compresses images before sending them.
app.use(express.json({ limit: '4mb' }));

// Used by local Node development. On Vercel, public/** is served by the CDN.
app.use(express.static(path.join(__dirname, 'public')));

function extractJson(text = '') {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('The AI model did not return valid JSON.');
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function clamp(n, min = 0, max = 100) {
  n = Number(n);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0;
}

function normalize(data) {
  const score = clamp(data.health_score);
  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'E';
  const nutrients = data.nutrients || {};

  return {
    food_name: String(data.food_name || 'Estimated meal'),
    summary: String(data.summary || 'AI-estimated nutrition from the uploaded image.'),
    health_score: Math.round(score),
    grade,
    confidence: String(data.confidence || 'medium').toLowerCase(),
    serving_estimate: String(data.serving_estimate || '1 visible serving'),
    calories: Math.max(0, Math.round(Number(data.calories) || 0)),
    nutrients: {
      protein: { grams: Number(nutrients.protein?.grams) || 0, score: clamp(nutrients.protein?.score) },
      carbs: { grams: Number(nutrients.carbs?.grams) || 0, score: clamp(nutrients.carbs?.score) },
      fat: { grams: Number(nutrients.fat?.grams) || 0, score: clamp(nutrients.fat?.score) },
      fiber: { grams: Number(nutrients.fiber?.grams) || 0, score: clamp(nutrients.fiber?.score) },
      minerals: { amount: String(nutrients.minerals?.amount || 'Estimated'), score: clamp(nutrients.minerals?.score) },
      vitamins: { amount: String(nutrients.vitamins?.amount || 'Estimated'), score: clamp(nutrients.vitamins?.score) }
    },
    positives: Array.isArray(data.positives) ? data.positives.slice(0, 4).map(String) : [],
    watch_outs: Array.isArray(data.watch_outs) ? data.watch_outs.slice(0, 4).map(String) : []
  };
}

const PROMPT = `You are a careful nutrition-estimation assistant. Analyze the food visible in this image.

Important: This is image-only estimation, not lab analysis and not an official European Nutri-Score. Estimate one visible serving, mention uncertainty, and do not make medical claims.

Return ONLY valid JSON with this exact structure:
{
  "food_name": "short meal name",
  "summary": "one friendly sentence",
  "health_score": 0-100,
  "confidence": "low|medium|high",
  "serving_estimate": "brief serving estimate",
  "calories": number,
  "nutrients": {
    "protein": {"grams": number, "score": 0-100},
    "carbs": {"grams": number, "score": 0-100},
    "fat": {"grams": number, "score": 0-100},
    "fiber": {"grams": number, "score": 0-100},
    "minerals": {"amount": "brief estimate", "score": 0-100},
    "vitamins": {"amount": "brief estimate", "score": 0-100}
  },
  "positives": ["short point"],
  "watch_outs": ["short point"]
}

For nutrient score, 100 means especially favorable for a balanced meal. For carbs and fat, score quality and balance, not simply quantity. Health score should consider food variety, vegetables/fruit, whole foods, protein quality, fiber, added sugar, sodium, highly processed foods, saturated fat, and portion balance.`;

async function analyzeWithGemini(imageBase64, mimeType) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured. Add it in Vercel Project Settings → Environment Variables.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMMA_MODEL)}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64
              }
            },
            { text: PROMPT }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemma API error ${response.status}: ${text.slice(0, 500)}`);
  }

  const responseData = await response.json();
  const raw = responseData?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || '')
    .join('\n')
    .trim();

  if (!raw) {
    const blockReason = responseData?.promptFeedback?.blockReason;
    throw new Error(blockReason ? `The request was blocked: ${blockReason}` : 'Gemma returned an empty response.');
  }

  return normalize(extractJson(raw));
}

async function analyzeWithOllama(imageBase64) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      format: 'json',
      messages: [
        {
          role: 'user',
          content: PROMPT,
          images: [imageBase64]
        }
      ],
      options: { temperature: 0.2 }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama error ${response.status}: ${text.slice(0, 500)}`);
  }

  const responseData = await response.json();
  const raw = responseData?.message?.content || '';
  return normalize(extractJson(raw));
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    provider: AI_PROVIDER,
    model: AI_PROVIDER === 'gemini' ? GEMMA_MODEL : OLLAMA_MODEL,
    configured: AI_PROVIDER === 'gemini' ? Boolean(GEMINI_API_KEY) : true
  });
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image supplied.' });
    }

    const safeMimeType = mimeType || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(safeMimeType)) {
      return res.status(400).json({ error: 'Please upload a JPG, PNG, or WebP image.' });
    }

    let result;
    if (AI_PROVIDER === 'gemini') {
      result = await analyzeWithGemini(imageBase64, safeMimeType);
    } else if (AI_PROVIDER === 'ollama') {
      result = await analyzeWithOllama(imageBase64);
    } else {
      return res.status(500).json({ error: `Unsupported AI_PROVIDER: ${AI_PROVIDER}` });
    }

    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Could not analyze the image.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

// Handle body-parser failures cleanly (for example an oversized image payload).
app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Image payload is too large. Please choose a smaller image.'
    });
  }

  console.error(error);
  return res.status(500).json({ error: 'Unexpected server error.' });
});

// Vercel imports the Express app as a function. Local development still uses
// the familiar `npm start` flow.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`NutriSnap running at http://localhost:${PORT}`);
    console.log(`AI provider: ${AI_PROVIDER}`);
    console.log(`Model: ${AI_PROVIDER === 'gemini' ? GEMMA_MODEL : OLLAMA_MODEL}`);
  });
}

export default app;
