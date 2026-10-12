const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";

// The production API is deployed as a separate Vercel project.
const CHAT_API_BASE = isLocal
  ? "http://localhost:3000"
  : "https://chat-app-backend-sujal-yadav1.vercel.app";

// Vercel serverless functions do not provide a persistent Socket.IO server.
// Keep this base aligned with the API until realtime transport is hosted separately.
const CHAT_SOCKET_BASE = CHAT_API_BASE;
