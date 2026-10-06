require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const groupRoutes = require("./routes/groupRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const aiRoutes = require("./routes/aiRoutes");
const socketAuth = require("./socket/socketAuth");
const { registerSocketHandlers } = require("./socket");
const { startArchiveJob } = require("./jobs/archiveMessages");

const app = express();
const server = http.createServer(app);

// Allowed browser origin(s). "*" by default for local dev. In production set
// CLIENT_ORIGIN (comma separated) so CORS is restricted to your real domain.
const allowedOrigins = (process.env.CLIENT_ORIGIN || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOrigin = allowedOrigins.includes("*") ? "*" : allowedOrigins;

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ["GET", "POST"] }
});

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Expose the Socket.IO instance to controllers (the upload controller uses it
// to broadcast a media message to the correct room after a successful upload).
app.set("io", io);

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/ai", aiRoutes);

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "ChatApp backend running" });
});

app.use(express.static(path.join(__dirname, "../frontend")));

// Central error handler so upload / validation errors return clean JSON.
app.use((error, req, res, next) => {
  const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  const message =
    error.code === "LIMIT_FILE_SIZE" ? "File is too large" : error.message || "Something went wrong";

  res.status(status).json({ success: false, message });
});

io.use(socketAuth);
registerSocketHandlers(io);

const PORT = process.env.PORT || 3000;

connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
    // In production Render runs the archive as a separate cron service.
    // Keep the in-process scheduler for local development unless explicitly disabled.
    if (process.env.ENABLE_INTERNAL_ARCHIVE_CRON !== "false") {
      startArchiveJob();
    } else {
      console.log("[archive] internal scheduler disabled; use external cron service");
    }
  })
  .catch((error) => {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  });