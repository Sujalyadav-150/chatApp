require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { runArchiveSafely } = require("./archiveMessages");

(async () => {
  try {
    await connectDB();
    const result = await runArchiveSafely();
    console.log("[archive-once]", result);
  } catch (error) {
    console.error("[archive-once] failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
})();
