# ChatApp Deployment Checklist

This project is prepared for a single Render web service plus an hourly Render cron job.
The same web service serves the frontend and keeps the Socket.IO connection alive.

## 1. MongoDB Atlas

Create a MongoDB Atlas database and copy the connection string.
Use it as `MONGO_URI` in the Render web service and cron job.

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

Set:

```text
MONGO_URI=<MongoDB Atlas connection string>
JWT_SECRET=<long random secret>
AWS_ACCESS_KEY_ID=<IAM access key>
AWS_SECRET_ACCESS_KEY=<IAM secret>
AWS_REGION=ap-south-1
AWS_S3_BUCKET=<bucket name>
CLIENT_ORIGIN=*
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

## 5. Verify after deployment

Open the Render web-service URL and test:

1. Signup/login with two users.
2. Start personal chat using the second user's real email.
3. Send messages from both accounts.
4. Create a group and add users.
5. Send group messages.
6. Upload an image, video, PDF and document.
7. Refresh and verify the history remains available.
8. Check `/api/health`.
9. Check the Render cron logs for `[archive-once]`.
