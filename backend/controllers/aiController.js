const Message = require("../models/Message");
const { isConfigured, generateJSON } = require("../services/openrouterService");

const MAX_CONTEXT_MESSAGES = 6;

// Personalization (bonus): adapt the tone of the suggestions.
function styleInstruction(style) {
  switch (String(style || "").toLowerCase()) {
    case "formal":
      return "Write in a polite, professional and formal tone.";
    case "playful":
      return "Write in a warm, playful tone and add at most one fitting emoji per reply.";
    case "casual":
    default:
      return "Write in a friendly, casual tone like a normal chat message.";
  }
}

// Pull the most recent messages of a room so suggestions are context aware.
async function buildContext(roomId) {
  if (!roomId) return "";

  try {
    const recent = await Message.find({ roomId })
      .sort({ createdAt: -1 })
      .limit(MAX_CONTEXT_MESSAGES)
      .populate("senderId", "name");

    return recent
      .reverse()
      .map((message) => `${message.senderId?.name || "User"}: ${message.text}`)
      .join("\n");
  } catch {
    return "";
  }
}

function cleanList(value, limit) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim())
    .slice(0, limit);
}

// When OPENROUTER_API_KEY is missing we do not fail the request; the frontend
// simply shows no suggestions and the rest of the app keeps working.
function aiNotConfigured(res, message) {
  return res.status(200).json({ success: false, configured: false, message });
}

exports.suggest = async (req, res) => {
  try {
    const { text = "", roomId, style } = req.body || {};

    if (!String(text).trim()) {
      return res.json({ success: true, suggestions: [] });
    }

    if (!isConfigured()) {
      return aiNotConfigured(res, "AI suggestions are disabled: OPENROUTER_API_KEY is not set.");
    }

    const context = await buildContext(roomId);

    const systemInstruction = [
      "You are an assistant inside a chat app that predicts how the user will finish the message they are currently typing.",
      styleInstruction(style),
      "Return exactly 3 short, natural continuations of the user's text.",
      "Each suggestion must be concise (1 to 6 words), must NOT repeat the user's text, and must be safe and appropriate.",
      'Respond ONLY with JSON: {"suggestions": ["...", "...", "..."]}'
    ].join(" ");

    const prompt = [
      context ? `Recent conversation:\n${context}\n` : "",
      `The user is currently typing: "${String(text).trim()}"`,
      "Predict the 3 most likely short continuations."
    ]
      .filter(Boolean)
      .join("\n");

    const data = await generateJSON({ systemInstruction, prompt, temperature: 0.9 });

    res.json({
      success: true,
      configured: true,
      suggestions: cleanList(data.suggestions, 3)
    });
  } catch (error) {
    res.status(502).json({ success: false, message: error.message });
  }
};

exports.smartReplies = async (req, res) => {
  try {
    const { roomId, lastMessage, style } = req.body || {};

    if (!isConfigured()) {
      return aiNotConfigured(res, "AI replies are disabled: OPENROUTER_API_KEY is not set.");
    }

    const context = await buildContext(roomId);
    const incoming = String(lastMessage || "").trim();

    if (!incoming && !context) {
      return res.json({ success: true, replies: [] });
    }

    const systemInstruction = [
      "You are an assistant inside a chat app that suggests quick replies to an incoming message.",
      styleInstruction(style),
      "Return exactly 3 short, distinct replies the user could send next.",
      "Each reply must be brief (under 12 words), safe, appropriate and directly relevant.",
      'Respond ONLY with JSON: {"replies": ["...", "...", "..."]}'
    ].join(" ");

    const prompt = [
      context ? `Recent conversation:\n${context}\n` : "",
      incoming ? `Incoming message to reply to: "${incoming}"` : "Suggest replies to continue the conversation.",
      "Suggest 3 quick replies."
    ]
      .filter(Boolean)
      .join("\n");

    const data = await generateJSON({ systemInstruction, prompt, temperature: 0.9 });

    res.json({
      success: true,
      configured: true,
      replies: cleanList(data.replies, 3)
    });
  } catch (error) {
    res.status(502).json({ success: false, message: error.message });
  }
};
