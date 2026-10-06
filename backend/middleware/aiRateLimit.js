// Lightweight in-memory rate limiter for the AI endpoints.
// It protects the OpenRouter quota from request bursts, for example
// while the user is typing quickly in the chat input. No extra dependency.
//
// Tunable through .env:
//   AI_RATE_WINDOW_MS    rolling window for the limit        (default 60000)
//   AI_RATE_MAX          max requests per user per window     (default 30)
//   AI_RATE_MIN_GAP_MS   min delay between two requests       (default 700)

const WINDOW_MS = Number(process.env.AI_RATE_WINDOW_MS) || 60000;
const MAX_REQUESTS = Number(process.env.AI_RATE_MAX) || 30;
const MIN_GAP_MS = Number(process.env.AI_RATE_MIN_GAP_MS) || 700;

// userId -> { timestamps: number[], lastAt: number }
const hits = new Map();

function tooMany(res, retryAfterMs, message) {
  res.set("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
  return res.status(429).json({ success: false, retryAfter: retryAfterMs, message });
}

function aiRateLimit(req, res, next) {
  const key = req.user?.id || req.ip;
  const now = Date.now();

  const entry = hits.get(key) || { timestamps: [], lastAt: 0 };

  // Drop timestamps that fell out of the rolling window.
  entry.timestamps = entry.timestamps.filter((time) => now - time < WINDOW_MS);

  // Throttle very quick successive calls (fast typing / double clicks).
  if (now - entry.lastAt < MIN_GAP_MS) {
    return tooMany(res, MIN_GAP_MS - (now - entry.lastAt), "Slow down a little before asking for more AI suggestions.");
  }

  // Enforce the per-window quota.
  if (entry.timestamps.length >= MAX_REQUESTS) {
    return tooMany(res, WINDOW_MS - (now - entry.timestamps[0]), "Too many AI requests. Please wait a moment and try again.");
  }

  entry.lastAt = now;
  entry.timestamps.push(now);
  hits.set(key, entry);

  next();
}

module.exports = aiRateLimit;