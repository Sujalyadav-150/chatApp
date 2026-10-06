const CHAT_API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://chat-app-backend-khaki-beta.vercel.app";