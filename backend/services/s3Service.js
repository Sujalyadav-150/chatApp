// AWS S3 upload service (AWS SDK v3).
// Credentials and bucket name come from environment variables only -
// they are NEVER hardcoded or exposed to the frontend.
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

function isConfigured() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_REGION &&
      process.env.AWS_S3_BUCKET
  );
}

let client = null;

function getClient() {
  if (!client) {
    client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }
  return client;
}

// Build a safe, unique object key inside the bucket.
function buildKey(originalName) {
  const safeName = String(originalName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `chat-media/${unique}-${safeName}`;
}

// Upload a file buffer and return { key, url }.
async function uploadBuffer({ buffer, originalName, contentType }) {
  if (!isConfigured()) {
    throw new Error("AWS S3 is not configured (missing AWS_* environment variables)");
  }

  const key = buildKey(originalName);

  await getClient().send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType
    })
  );

  const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

  return { key, url };
}

module.exports = { isConfigured, uploadBuffer };