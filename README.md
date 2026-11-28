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
- **Apify Archive**: Saves one record per platform and post ID in MongoDB, plus daily Indeed and JobStreet snapshots.
- **Easy Cleanup**: 100% self-contained in this single folder.

---

## 1. Quick Local Run (No Database Required)

Open your terminal in this directory:

```bash
cd c:\Users\User\Documents\GitHub\job-stats-dashboard
npm install
npm run dev
```

If you configure `MONGODB_URI` in `.env`, run `npm run db:indexes` once to
create the indexes used by snapshot lookups and dashboard history.

Open [http://localhost:3000](http://localhost:3000) in your browser.
You can enter your RSSHub URL (e.g. `http://localhost:1200`) directly in the top input bar and click **Apply URL**!

### Indeed and JobStreet via Apify

Add `APIFY_TOKEN` to `.env` locally and to the Vercel environment variables for the
deployed dashboard. The two `APIFY_*_INPUT` JSON values in `.env.example` search
Malaysia and cap each run at 100 results. Adjust them in `.env` if needed.

Run `npm run apify:schedule` once to create or update one Apify schedule. It runs
both actors seven times daily at **00:00, 03:00, 07:00, 10:00, 14:00, 17:00,
and 21:00 Malaysia time**. The main dashboard reads the latest successful run
from each actor. The `/apify` page saves the latest completed runs when opened or
refreshed and displays unique jobs from MongoDB. A separate daily Vercel cron
imports up to 20 recent successful runs per actor to catch runs missed between
page visits. Two actors running seven times each means 14 paid
actor runs per day, subject to Apify pricing.

For Apify rows, the 7-day and 30-day columns count posting dates relative to
the time that run finished. JobStreet searches its supported 31-day date range
and the dashboard applies the exact 30-day cutoff. Indeed does not offer a
30-day input filter, so its run is not date-filtered. Both counts describe the
up to 100 results collected in that run, not all jobs on either platform.

Open `/apify` on the running dashboard to review all saved Indeed and JobStreet
jobs in the 16-field format. MongoDB uses a unique `(platform, postId)` index, so
repeat runs update existing jobs and new IDs increase the archive. The page
includes server-side source, date, search, and missing-core-field filters,
paginated rows, full job details, and CSV export of all matching jobs. Coverage
counts still describe the latest imported run from each actor. Missing values
are shown as blank; requirement text is extracted only when a clear requirements
section is present in the actor's description. Without `MONGODB_URI`, the page
falls back to the latest runs without an archive.

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
     - `CRON_SECRET`: *(Optional)* Any secret string to protect both cron routes.
     - `APIFY_TOKEN`: Apify API token for reading and archiving completed actor runs.
3. Click **Deploy**!

Once deployed:
- Vercel will run `/api/cron` daily at `07:00 UTC` (15:00 Malaysia time) for RSS snapshots.
- Vercel will run `/api/apify/cron` daily at `08:00 UTC` (16:00 Malaysia time) to import recent Apify runs and save one Indeed and JobStreet snapshot per run date.
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
