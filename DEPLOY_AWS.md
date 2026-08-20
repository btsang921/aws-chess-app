# Deploy This Chess App on AWS

This guide deploys the app using:

- React frontend: Amazon S3 + CloudFront
- Node.js / Express / Socket.IO backend: AWS Elastic Beanstalk
- Database: Amazon RDS PostgreSQL

The deployed app will have a public CloudFront URL that anyone can visit.

---

## Before you start

Install these locally:

- Node.js 20+
- Git
- AWS CLI
- Elastic Beanstalk CLI
- PostgreSQL client, optional but useful

Recommended AWS Region: `us-east-1`.

---

## Part 1 — Create the RDS PostgreSQL database

1. Go to AWS Console → RDS.
2. Choose **Create database**.
3. Choose **Standard create**.
4. Engine: **PostgreSQL**.
5. Template: **Free tier** if available.
6. DB instance identifier: `chess-postgres`.
7. Master username: `chessadmin`.
8. Master password: save this somewhere safe.
9. DB instance class: choose the smallest free-tier/general dev option available.
10. Storage: keep the default or minimum.
11. Connectivity:
    - Choose the default VPC.
    - Public access: for easiest first deployment, choose **Yes**.
    - Later, you can lock this down to only the Elastic Beanstalk security group.
12. Database authentication: Password authentication.
13. Additional configuration:
    - Initial database name: `chess_app`.
14. Create database.

After creation, open the database and copy the endpoint. It will look like:

```text
chess-postgres.abc123xyz.us-east-1.rds.amazonaws.com
```

Your database URL will be:

```env
DATABASE_URL=postgresql://chessadmin:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/chess_app
```

Example:

```env
DATABASE_URL=postgresql://chessadmin:MyPassword123@chess-postgres.abc123xyz.us-east-1.rds.amazonaws.com:5432/chess_app
```

### Security group note

For the fastest first deployment, you can allow inbound PostgreSQL traffic on port `5432` from your IP and later from Elastic Beanstalk.

For a better setup:

- Find your Elastic Beanstalk EC2 security group after creating the backend.
- Add an RDS inbound rule:
  - Type: PostgreSQL
  - Port: 5432
  - Source: Elastic Beanstalk EC2 security group

---

## Part 2 — Deploy the backend to Elastic Beanstalk

### Option A: AWS Console method

1. Zip only the contents of the `server` folder.
2. Go to AWS Console → Elastic Beanstalk.
3. Create application.
4. Application name: `chess-backend`.
5. Environment: Web server environment.
6. Platform: Node.js.
7. Upload your server ZIP.
8. Create environment.

After the environment is created, go to:

Elastic Beanstalk → your environment → Configuration → Software → Environment properties.

Add:

```env
NODE_ENV=production
PORT=8080
JWT_SECRET=replace_with_a_very_long_random_secret
DATABASE_URL=postgresql://chessadmin:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/chess_app
CLIENT_ORIGIN=http://localhost:5173
```

`CLIENT_ORIGIN` is temporary. You will update it after CloudFront gives you a frontend URL.

### Option B: EB CLI method

From the project folder:

```bash
cd server
eb init
```

Choose:

- Your AWS region
- Create new application or select existing one
- Platform: Node.js
- SSH setup: optional

Then create the environment:

```bash
eb create chess-backend-prod
```

Set environment variables:

```bash
eb setenv NODE_ENV=production PORT=8080 JWT_SECRET=replace_with_a_very_long_random_secret DATABASE_URL="postgresql://chessadmin:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/chess_app" CLIENT_ORIGIN="http://localhost:5173"
```

Deploy:

```bash
eb deploy
```

Open the backend:

```bash
eb open
```

Test the health endpoint in your browser:

```text
http://YOUR_EB_URL.elasticbeanstalk.com/api/health
```

You should see:

```json
{ "ok": true, "service": "chess-api" }
```

---

## Part 3 — Deploy the React frontend to S3

Go to the `client` folder and create a production environment file:

```bash
cd ../client
```

Create `.env.production`:

```env
VITE_API_URL=http://YOUR_EB_URL.elasticbeanstalk.com
```

Example:

```env
VITE_API_URL=http://chess-backend-prod.us-east-1.elasticbeanstalk.com
```

Install and build:

```bash
npm install
npm run build
```

This creates a `dist` folder.

### Create S3 bucket

1. Go to AWS Console → S3.
2. Create bucket.
3. Bucket name: something globally unique, for example `branden-chess-frontend-2026`.
4. Region: same region if possible.
5. Keep **Block all public access** on if you are using CloudFront Origin Access Control.
6. Create bucket.

Upload the contents of `client/dist` into the bucket.

Important: upload the files inside `dist`, not the `dist` folder itself.

---

## Part 4 — Put CloudFront in front of S3

1. Go to AWS Console → CloudFront.
2. Create distribution.
3. Origin domain: choose your S3 bucket.
4. Origin access: choose **Origin access control settings**.
5. Create new OAC if prompted.
6. Viewer protocol policy: Redirect HTTP to HTTPS.
7. Default root object: `index.html`.
8. Create distribution.

CloudFront will give you a URL like:

```text
https://d123abc456.cloudfront.net
```

### Fix React refresh routing

In CloudFront:

1. Open your distribution.
2. Go to Error pages.
3. Create custom error response:
   - HTTP error code: 403
   - Customize error response: Yes
   - Response page path: `/index.html`
   - HTTP response code: 200
4. Add another one for 404:
   - Response page path: `/index.html`
   - HTTP response code: 200

---

## Part 5 — Update backend CORS to allow CloudFront

Now update Elastic Beanstalk `CLIENT_ORIGIN` to your CloudFront URL:

```env
CLIENT_ORIGIN=https://d123abc456.cloudfront.net
```

Using EB CLI:

```bash
cd ../server
eb setenv CLIENT_ORIGIN="https://d123abc456.cloudfront.net"
eb deploy
```

Or use the AWS Console:

Elastic Beanstalk → Environment → Configuration → Software → Environment properties.

---

## Part 6 — Test the deployed app

1. Open your CloudFront URL.
2. Register a user.
3. Open an incognito window or another browser.
4. Register a second user.
5. Join the same room code from both accounts.
6. Make moves.
7. Resign or checkmate.
8. Confirm match history appears.