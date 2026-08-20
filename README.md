# AWS Chess Full-Stack App

A full-stack multiplayer chess web application built with:

- React + Vite frontend
- Node.js + Express backend
- Socket.IO real-time multiplayer
- PostgreSQL persistence
- JWT authentication
- bcrypt password hashing
- chess.js legal move validation
- Match history storage

## Local setup

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Create local PostgreSQL database

Create a PostgreSQL database named `chess_app`, or use any hosted PostgreSQL URL.

Example local URL:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/chess_app
JWT_SECRET=local_dev_secret_change_me
CLIENT_ORIGIN=http://localhost:5173
PORT=8080
```

Put those values in `server/.env`.

### 3. Run locally

```bash
npm run dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:8080

## Deploying to AWS

See `DEPLOY_AWS.md` for the full step-by-step AWS deployment guide.
