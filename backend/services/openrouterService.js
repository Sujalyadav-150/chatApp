// Thin wrapper around the OpenRouter API (https://openrouter.ai).
// OpenRouter exposes an OpenAI-compatible Chat Completions endpoint, so we use
// the built-in `fetch` (Node 18+) instead of an SDK dependency.
// The key and model come from the environment: OPENROUTER_API_KEY / OPENROUTER_MODEL.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Models are tried in order until one succeeds. `.env` can override the first
// entry with OPENROUTER_MODEL if you want a specific model.
const CANDIDATE_MODELS = [
  process.env.OPENROUTER_MODEL,
  "openai/gpt-4o-mini",
  "openai/gpt-4.1-mini",
  "google/gemini-2.5-flash",
  "meta-llama/llama-3.3-70b-instruct"
].filter(Boolean);

// Remember the first model that worked so later calls skip the probing.
let workingModel = null;

function isConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function stripCodeFences(text) {
  return String(text || "")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

// Models are asked for JSON, but they occasionally wrap it in prose or code
// fences, so we parse defensively.
function safeParseJSON(text) {
  const cleaned = stripCodeFences(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("OpenRouter did not return valid JSON");
  }
}

// Only fall through to another model when the failure looks model specific.
// Auth / payment errors should surface immediately instead of trying every model.
function shouldTryNextModel(error) {
  const status = error?.status;
  const message = String(error?.message || "").toLowerCase();

  if (status === 401 || status === 403 || status === 402) {
    return false;
  }

  if (status === 400 || status === 404) {
    return /model|not found|invalid|unsupported|does not exist|slug/.test(message);
  }

  // 429 (rate limit) and 5xx deserve a chance on the next model/provider.
  return true;
}

async function requestModel(model, { systemInstruction, prompt, temperature }) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      // Optional attribution shown on the OpenRouter leaderboards.
      "X-OpenRouter-Title": "ChatApp"
    },
    body: JSON.stringify({
      model,
      messages: [
        systemInstruction ? { role: "system", content: systemInstruction } : null,
        { role: "user", content: prompt }
      ].filter(Boolean),
      temperature
    })
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(
      data?.error?.message || `OpenRouter request failed (${res.status})`
    );
    error.status = res.status;
    throw error;
  }

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    const error = new Error("OpenRouter returned an empty response");
    error.status = 502;
    throw error;
  }

  return content;
}

async function generateJSON({ systemInstruction, prompt, temperature = 0.8 }) {
  if (!isConfigured()) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const order = workingModel
    ? [workingModel, ...CANDIDATE_MODELS.filter((model) => model !== workingModel)]
    : CANDIDATE_MODELS;

  let lastError;

  for (const model of order) {
    try {
      const text = await requestModel(model, { systemInstruction, prompt, temperature });
      workingModel = model;
      return safeParseJSON(text);
    } catch (error) {
      lastError = error;
      if (!shouldTryNextModel(error)) break;
    }
  }

  throw lastError || new Error("OpenRouter request failed");
}

module.exports = { isConfigured, generateJSON };