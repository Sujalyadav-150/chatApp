const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
// Use the Render backend for auth and email delivery. SMTP variables are configured on Render.
const CHAT_API_BASE = isLocal ? "http://localhost:3000" : "https://chatapp.onrender.com";
const CHAT_SOCKET_BASE = isLocal ? "http://localhost:3000" : "https://chatapp.onrender.com";
