# ChatApp Deployment

Vercel serves the static frontend. The persistent Render web service hosts the
Express API, MongoDB connection, and Socket.IO server. Vercel Functions do not
host this application's long-lived Socket.IO server.

## 1. MongoDB Atlas

Create a MongoDB Atlas database and set its connection string as `MONGO_URI` in
the Render web service and cron job.

## 2. AWS S3

Create a bucket in a region such as `ap-south-1`.

Create an IAM user for the backend and give it only the S3 permissions required for
this bucket. The backend needs object upload permission for `chat-media/*` and does
not need bucket administration permissions.

Apply `aws-s3-cors.json` as the bucket CORS configuration.

The application stores direct S3 object URLs, so the chat clients must be able to
read objects under `chat-media/*`. For this student assignment, the included
`aws-s3-bucket-policy.template.json` can be adapted to permit `s3:GetObject` only
for that prefix. Do not give the IAM user public permissions.

For a production application, keep the bucket private and use CloudFront or signed
GET URLs instead.

## 3. Render web service

Connect the GitHub repository to Render and use the included `render.yaml` blueprint,
or configure manually:

- Runtime: Node
- Root directory: `backend`
- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/api/health`

Set the required values (and optional integrations) in the Render web service:

```text
MONGO_URI=<MongoDB Atlas connection string>
JWT_SECRET=<long random secret>
AWS_ACCESS_KEY_ID=<IAM access key>
AWS_SECRET_ACCESS_KEY=<IAM secret>
AWS_REGION=ap-south-1
AWS_S3_BUCKET=<bucket name>
CLIENT_ORIGIN=https://chat-app-phi-brown-66.vercel.app
ENABLE_INTERNAL_ARCHIVE_CRON=false
ARCHIVE_AFTER_HOURS=24
MAX_UPLOAD_BYTES=26214400
```

Do not upload `backend/.env` or commit secrets to GitHub.

## 4. Render cron job

The blueprint creates an hourly cron job:

```text
npm run archive
```

It moves messages older than 24 hours into `ArchivedChat` and then deletes the
successfully archived messages from `Message`.

The `CLIENT_ORIGIN` value may be a comma-separated list of allowed origins. The
frontend selects `http://localhost:3000` for local development and
`https://chatapp.onrender.com` as its production API and Socket.IO server.

## 5. Vercel frontend

Connect the GitHub repository and deploy the `main` branch. Keep the Root
Directory at the repository root, leave build and install commands empty, and
set the Output Directory to `frontend`. `vercel.json` applies this static
configuration as well. Do not configure the frontend directory as a Node
serverless function: that cannot keep this app's Socket.IO connections alive.

## 6. Verify after deployment

Open the Render web-service URL and test:

1. Signup/login with two users.
2. Start personal chat using the second user's real email.
3. Send messages from both accounts.
4. Create a group and add users.
5. Send group messages.
6. Upload an image, video, PDF and document.
7. Refresh and verify the history remains available.
8. Check `https://chatapp.onrender.com/api/health`.
9. Check the Render cron logs for `[archive-once]`.

Required environment variables are listed in `backend/.env.example`. Never
commit `backend/.env`.
