## Local Setup

1. Install dependencies with `pnpm install`.
2. Create `.env.local` from `.env.example`.
3. Paste your Neon connection string into `DATABASE_URL`.
4. Set `REFRESH_SECRET` to any local secret.
5. Run `pnpm db:reset` once to recreate the central schema.
6. Run `pnpm refresh:news` to fetch RSS articles, store publishers and articles, and rebuild stories.
7. Run `pnpm dev` and open the local Next.js URL.

## Local Test Flow Before Pushing

- `pnpm db:reset` recreates the `publishers`, `stories`, and `articles` tables from scratch.
- `pnpm db:migrate` verifies the Neon database connection and ensures the schema exists.
- `pnpm refresh:news` verifies RSS ingestion, publisher upserts, article storage, story grouping, and Postgres writes.
- `pnpm build` verifies the Next.js production build.
- `pnpm dev` runs the frontend and backend API routes locally through Next.js.

## Netlify Setup

1. Connect the GitHub repo to Netlify.
2. Use `pnpm build` as the build command and `.next` as the publish directory.
3. Add `DATABASE_URL`, `REFRESH_SECRET`, and `NEXT_PUBLIC_GA_ID` in Netlify environment variables.
4. After deploy, trigger `POST /api/refresh-news` with header `x-refresh-secret: <your secret>` once.
5. Netlify scheduled function `refresh-news-scheduled` will refresh RSS articles and stories every hour after that.
6. Netlify scheduled function `extract-content-scheduled` invokes the background extractor every 15 minutes. The background extractor keeps working in 10-minute runs until the current queue is drained.

## Local URLs

- Local app and API routes: `http://localhost:3000`
- Local scheduled function testing is optional. If you want to debug the Netlify function itself, use `pnpm dev:netlify` and `netlify functions:invoke refresh-news-scheduled`.

## How It Works

- Next.js renders the frontend.
- Next.js route handlers provide `/api/news-feed`, `/api/refresh-news`, and `/api/story-image`.
- `publishers` stores source-level metadata such as name, domain, country, and language.
- `articles` stores fetched article records and links each row to its publisher and optional story.
- `stories` stores the canonical grouped story record with topic, location, status, and importance fields.
- The refresh route and hourly scheduled function prune old articles, regroup the current article set, write story rows, and set `articles.story_id`.
- Full article content extraction is launched by its own scheduled function and runs separately in the background so the hourly refresh stays fast enough for scheduled function limits.
- Scheduled and background function runs are also recorded in the `job_runs` table with status, timestamps, messages, and metadata for debugging.
- The homepage reads the prepared stories from `/api/news-feed`.

## Current RSS Source Set

- Hindustan Times
- The Indian Express
- Mint
- The Times of India
- NDTV
- Deccan Herald
