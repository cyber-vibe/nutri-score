import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function extractJson(text = '') {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('Model did not return JSON.');
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

app.post('/api/analyze', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'No image supplied.' });
    if (mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      return res.status(400).json({ error: 'Please upload a JPG, PNG, or WebP image.' });
    }

    const prompt = `You are a careful nutrition-estimation assistant. Analyze the food visible in this image.\n\nImportant: This is image-only estimation, not lab analysis and not an official European Nutri-Score. Estimate one visible serving, mention uncertainty, and do not make medical claims.\n\nReturn ONLY valid JSON with this exact structure:\n{\n  "food_name": "short meal name",\n  "summary": "one friendly sentence",\n  "health_score": 0-100,\n  "confidence": "low|medium|high",\n  "serving_estimate": "brief serving estimate",\n  "calories": number,\n  "nutrients": {\n    "protein": {"grams": number, "score": 0-100},\n    "carbs": {"grams": number, "score": 0-100},\n    "fat": {"grams": number, "score": 0-100},\n    "fiber": {"grams": number, "score": 0-100},\n    "minerals": {"amount": "brief estimate", "score": 0-100},\n    "vitamins": {"amount": "brief estimate", "score": 0-100}\n  },\n  "positives": ["short point"],\n  "watch_outs": ["short point"]\n}\n\nFor nutrient score, 100 means especially favorable for a balanced meal. For carbs and fat, score quality and balance, not simply quantity. Health score should consider food variety, vegetables/fruit, whole foods, protein quality, fiber, added sugar, sodium, highly processed foods, saturated fat, and portion balance.`;

    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [imageBase64]
          }
        ],
        options: { temperature: 0.2 }
      })
    });

    if (!ollamaResponse.ok) {
      const text = await ollamaResponse.text();
      throw new Error(`Ollama error ${ollamaResponse.status}: ${text.slice(0, 300)}`);
    }

    const responseData = await ollamaResponse.json();
    const raw = responseData?.message?.content || '';
    const parsed = extractJson(raw);
    res.json(normalize(parsed));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Could not analyze the image. Make sure Ollama is running and Gemma 3 is installed.',
      detail: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`NutriSnap running at http://localhost:${PORT}`);
  console.log(`Using Ollama model: ${OLLAMA_MODEL}`);
});
