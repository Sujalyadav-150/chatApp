// Multer configuration for media sharing.
// Files are held in memory, validated against an allow-list, then streamed to
// S3 by the upload controller (nothing is written to local disk).
const multer = require("multer");

const MAX_FILE_SIZE = Number(process.env.MAX_UPLOAD_BYTES) || 25 * 1024 * 1024; // 25 MB

// Explicit allow-list - only reasonable, safe media/document types.
const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip"
];

// Map a mime type to the messageType stored in the database.
function fileTypeFromMime(mime) {
  const value = String(mime || "");
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("video/")) return "video";
  if (value.startsWith("audio/")) return "audio";
  return "file";
}

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    const error = new Error(`Unsupported file type: ${file.mimetype}`);
    error.status = 400;
    return cb(error);
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter
});

module.exports = { upload, fileTypeFromMime, MAX_FILE_SIZE, ALLOWED_MIME };