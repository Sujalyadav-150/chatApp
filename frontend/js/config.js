const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const CHAT_API_BASE = isLocal ? "http://localhost:3000" : "https://chat-app-backend-khaki-beta.vercel.app";
const CHAT_SOCKET_BASE = isLocal ? "http://localhost:3000" : "https://chatapp.onrender.com";