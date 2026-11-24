# Temporary Job Statistics Dashboard

A lightweight, standalone Next.js dashboard built to track metrics across RSSHub job feeds (**Maukerja**, **GoGet**, **FastJobs**, **Troopers**) with optional **MongoDB Atlas** persistence and **Vercel Cron** automation.

---

## Features

- **Live & Snapshot Metrics**:
  - Total posts returned per job source
  - Complete fields count & percentage (`title`, `link`, `author`, `description`, `pubDate`, `tags`)
  - Malaysian location detection (`category` tags & text summary)
  - Date recency: posts published within **7 days** and **30 days**
- **Dual Mode**:
  - **Live Mode**: Works immediately without any database!
  - **MongoDB Mode**: Automatically records snapshots to MongoDB Atlas when `MONGODB_URI` is provided.
- **Vercel Cron**: Scheduled daily snapshots configured in `vercel.json`.
- **Easy Cleanup**: 100% self-contained in this single folder.

---

## 1. Quick Local Run (No Database Required)

Open your terminal in this directory:

```bash
cd c:\Users\User\Documents\GitHub\job-stats-dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
You can enter your RSSHub URL (e.g. `http://localhost:1200`) directly in the top input bar and click **Apply URL**!

---

## 2. Deploying to Vercel & Connecting to MongoDB

### Step A: Set Up Free MongoDB Atlas
1. Create a free account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Create an **M0 Free Cluster**.
3. Under **Database Access**, create a user (e.g. `jobuser` + password).
4. Under **Network Access**, add IP `0.0.0.0/0` (Allow from anywhere — required for Vercel serverless functions).
5. Click **Connect** -> **Drivers** and copy your URI:
   ```text
   mongodb+srv://<username>:<password>@cluster0.xxxx.mongodb.net/job_analytics?retryWrites=true&w=majority
   ```

### Step B: Deploy to Vercel (No `.env` files touched!)
1. Push this folder to a GitHub repository or use the Vercel CLI.
2. In the [Vercel Dashboard](https://vercel.com):
   - Import this repository.
   - Go to **Settings** -> **Environment Variables**.
   - Add:
     - `MONGODB_URI`: Your MongoDB connection string.
     - `RSSHUB_BASE_URL`: The URL of your reachable RSSHub instance.
     - `CRON_SECRET`: *(Optional)* Any secret string to protect your `/api/cron` route.
3. Click **Deploy**!

Once deployed:
- Vercel will run the `/api/cron` endpoint daily at `00:00 UTC` and save snapshots to MongoDB.
- Visiting your Vercel URL displays the real-time statistics and historical snapshots.

---

## 3. How to Completely Remove This Later

Because this app is completely isolated in this folder and doesn't touch any of your other repositories:

1. **Delete from local disk**:
   ```powershell
   Remove-Item -Recurse -Force "c:\Users\User\Documents\GitHub\job-stats-dashboard"
   ```
2. **Delete from Vercel**:
   Go to **Project Settings** -> Scroll to the bottom -> Click **Delete Project**.
3. **Delete from MongoDB Atlas**:
   Drop the database `job_analytics` or delete the free cluster.
