# ChatApp - Real-Time Messaging

ChatApp is a full-stack real-time messaging application built for personal and group conversations.

## Features

- User signup and login with password hashing
- JWT-based authentication for REST API and Socket.IO
- Personal messaging with deterministic private rooms
- Group chat with member validation
- Persistent messages and chat history
- Real-time text messages through Socket.IO
- AWS S3 media/file sharing
- Archive messages older than 24 hours
- Optional AI typing suggestions and smart replies through OpenRouter
- Responsive HTML, CSS and JavaScript frontend

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Real-time communication: Socket.IO
- Database: MongoDB with Mongoose
- Authentication: bcryptjs and JSON Web Tokens
- Media storage: AWS S3
- Hosting: Vercel for the static frontend and Render for the persistent API/Socket.IO server

## Project Structure

```text
chatApp/
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── jobs/
│   ├── models/
│   ├── routes/
│   ├── socket/
│   └── server.js
├── frontend/
│   ├── css/
│   ├── js/
│   ├── index.html
│   ├── login.html
│   ├── signup.html
│   └── chat.html
├── render.yaml
├── aws-s3-cors.json
└── DEPLOYMENT.md
```

## Local Setup

### 1. Requirements

Install Node.js and have access to a MongoDB instance. Configure AWS S3 only if you want to test file uploads, and configure an OpenRouter API key only if you want to enable AI suggestions.

### 2. Configure the backend

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm start
```

Edit `backend/.env` and supply the required values, including:

```text
MONGO_URI=<your MongoDB connection string>
JWT_SECRET=<a long random secret>
CLIENT_ORIGIN=http://localhost:3000
AWS_ACCESS_KEY_ID=<your AWS access key, if using uploads>
AWS_SECRET_ACCESS_KEY=<your AWS secret, if using uploads>
AWS_REGION=ap-south-1
AWS_S3_BUCKET=<your S3 bucket name>
OPENROUTER_API_KEY=<your key, optional>
```

Use the exact variable names required by the backend configuration. Never commit real credentials or the `.env` file.

### 3. Open the frontend

When running the local backend, open the frontend at http://localhost:3000. The production API and Socket.IO host are configured in `frontend/js/config.js`.

## Deployment

Deployment guidance for Vercel, Render, MongoDB Atlas, and AWS S3 is available in [DEPLOYMENT.md](DEPLOYMENT.md). The frontend is hosted on Vercel; the persistent Express and Socket.IO server is hosted separately.

After deploying, verify the backend health endpoint:

```text
https://chatapp.onrender.com/api/health
```

## Security Notes

- Keep API keys, MongoDB credentials, JWT secrets, and AWS credentials out of Git.
- Use a strong, unique JWT secret in production.
- Keep AWS permissions limited to the required S3 bucket and object prefix.
- Review uploads, access controls, validation, and rate limits before production use.
- Do not ask users to enter credentials on a site they do not trust.

## Troubleshooting

- Check backend hosting logs for API errors.
- Verify MongoDB connection and required environment variables.
- Ensure `CLIENT_ORIGIN` contains the deployed frontend origin.
- Confirm the persistent backend and Socket.IO host are running.
- If Chrome shows a “Dangerous site” interstitial, do not bypass the warning for normal visitors. Check Google Safe Browsing and Search Console, fix any reported problem, and request a review after the site is clean.

## License

Add a license file if you intend to distribute this project under an open-source license.
