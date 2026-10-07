<<<<<<< HEAD
# ChatApp - Mock Interview Practice

This is a learning project based on the ChatApp requirements.

## Features
- Signup with name, email, phone and password
- Password hashing with bcrypt
- Login using email or phone
- JWT authentication
- Express REST APIs
- MongoDB/Mongoose
- Socket.IO frontend/backend
- Socket authentication
- Personal messaging with deterministic private rooms
- Backend validation of the receiver email before chat starts
- Group chat with member validation
- Save messages to database and fetch history after refresh
- Real-time text messages through Socket.IO rooms
- AWS S3 image/video/file sharing
- Automatic archiving of messages older than 24 hours
- Retry-safe archive job with `ArchivedChat`
- Render deployment blueprint for the web server and archive cron job

## AI chat suggestions (optional)
When an OpenRouter API key is configured the chat adds two helpers:
- **Typing suggestions** - 3 short continuations for the text you are typing.
- **Smart replies** - 3 quick replies to the last incoming message.

Both are context aware (they read the latest room messages) and follow the
selected **Tone** (casual / formal / playful). Without a key the app keeps
working normally and simply shows no suggestions.

The AI provider is [OpenRouter](https://openrouter.ai), which exposes an
OpenAI-compatible API so we call it with plain `fetch` (no SDK dependency).
Any model on OpenRouter can be used (OpenAI, Google, Meta, Anthropic, ...);
if a model is unavailable the service transparently falls back to the next
candidate model.

### Enable it
1. Create a free API key at https://openrouter.ai/keys
2. Open `backend/.env` and set:
   ```
   OPENROUTER_API_KEY=your_key_here
   # optional: OPENROUTER_MODEL=openai/gpt-4o-mini
   ```
3. Restart the backend (`npm start`) and reload `chat.html`.

### Rate limiting
The AI endpoints are protected by a small in-memory limiter so fast typing
cannot waste the OpenRouter quota:
- the frontend debounces typing (600 ms), waits for a 1.5 s cooldown between
  calls, ignores very short input and cancels stale requests;
- the backend allows about 30 requests per user per minute with a small
  minimum gap and answers `429` with a `Retry-After` header when exceeded.

Tune it in `backend/.env` with `AI_RATE_WINDOW_MS`, `AI_RATE_MAX` and
`AI_RATE_MIN_GAP_MS`.

## Setup

### 1. Start MongoDB
Use local MongoDB or MongoDB Atlas.

### 2. Backend
```bash
cd backend
copy .env.example .env
npm install
npm start
```

On PowerShell, if `copy` behaves differently, simply create `.env` manually using `.env.example`.

### 3. Open
http://localhost:3000

## Important interview functions
- `io.on("connection")`
- `socket.emit()`
- `socket.on()`
- `socket.join()`
- `io.to(roomId).emit()`
- `io.use()` for socket authentication
- JWT verification
- `createRoomId()`

## Note
This project is intentionally kept simple for hands-on interview practice, but the
Sharpener assignment requirements are implemented end-to-end. Production hardening
would still include stronger rate limiting, antivirus/file scanning, private S3
objects behind signed URLs or CloudFront, audit logging, and more comprehensive
automated tests.


## Sharpener assignment status

The current project includes the required Socket.IO personal messaging, backend
user validation, deterministic private rooms, group chat, AWS S3 media sharing,
and automatic chat archiving. The deployment configuration below is included so
the same Node.js server can serve the frontend and keep Socket.IO connected.

### Media sharing

The backend uploads files to S3 and stores the resulting object URL in the
message. Supported types include images, videos, PDF, common Office files,
text and ZIP files. The default maximum upload size is 25 MB.

Set these variables in `backend/.env`:

```text
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-south-1
AWS_S3_BUCKET=...
MAX_UPLOAD_BYTES=26214400
```

Never commit real AWS credentials. The repository already ignores `.env`.

For the assignment's S3 CORS requirement, apply `aws-s3-cors.json` to the
bucket. Because the application uploads through the Node.js backend, the
browser does not need direct S3 upload permission.

The stored S3 URLs must be readable by the chat clients. For a simple student
assignment deployment, configure an S3 bucket policy that permits `s3:GetObject`
for the `chat-media/*` prefix. Keep `s3:PutObject` permission restricted to the
IAM user used by the backend. For a production system, replace public object
reads with CloudFront or signed GET URLs.

### Chat archiving

Messages older than 24 hours are archived into `ArchivedChat`. The local server
runs the scheduler from `jobs/archiveMessages.js`. A standalone command is also
available:

```bash
cd backend
npm run archive
```

The archive operation is retry-safe: it upserts by the original message ID and
only deletes from `Message` after the archive writes succeed.
Messages are processed in configurable batches (`ARCHIVE_BATCH_SIZE`, default
500) to keep memory use bounded. The Render cron runs daily at 02:00 UTC; each
run drains all messages older than `ARCHIVE_AFTER_HOURS` before finishing.

### Deployment

The included `render.yaml` is prepared for Render. It creates:

1. A Node.js web service running Express + Socket.IO and serving `frontend/`.
2. An hourly cron job that runs `npm run archive`.

Before deploying, create a MongoDB Atlas database and an S3 bucket, then add the
secret environment variables in Render. The health endpoint is:

```text
/api/health
```

After deployment, open the Render web-service URL. The frontend, REST APIs and
Socket.IO all use the same origin, so no separate frontend hosting is required.

### Git commands

```bash
git add .
git commit -m "feat: complete sharpener chat app requirements"
git push origin main
```

Do not commit `backend/.env`, AWS keys, MongoDB passwords, or other secrets.
=======
# chatApp
>>>>>>> 15183da817716a4a2cae37401959883dd2135b60
