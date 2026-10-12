const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";

// The REST API is deployed as a separate Vercel project.
// Keep the persistent Socket.IO connection on Render.
const CHAT_API_BASE = isLocal
  ? "http://localhost:3000"
  : "https://chat-app-backend-khaki-beta.vercel.app";

const CHAT_SOCKET_BASE = isLocal
  ? "http://localhost:3000"
  : "https://chatapp.onrender.com";
