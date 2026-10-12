const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";

// The production frontend is static on Vercel; the Express API runs on Render.
const CHAT_API_BASE = isLocal
  ? "http://localhost:3000"
  : "https://chatapp.onrender.com";

// Socket.IO requires the persistent Render server, not a Vercel serverless function.
const CHAT_SOCKET_BASE = CHAT_API_BASE;
