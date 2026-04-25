## Local Setup

1. Install dependencies with `pnpm install`.
2. Create `.env.local` from `.env.example`.
3. Paste your Neon connection string into `DATABASE_URL`.
4. Set `REFRESH_SECRET` to any local secret.
5. Run `pnpm db:reset` once to drop the current app tables and recreate the new schema.
6. Run `pnpm refresh:news` to fetch RSS stories, save raw articles, and build grouped stories.
7. Run `pnpm dev` and open the Netlify Dev URL.

## Local Test Flow Before Pushing

- `pnpm db:reset` recreates the `articles`, `stories`, and `story_articles` tables from scratch.
- `pnpm db:migrate` verifies the Neon database connection and ensures the schema exists.
- `pnpm refresh:news` verifies RSS ingestion, article storage, story grouping, and Postgres writes.
- `pnpm build` verifies the Next.js production build.
- `pnpm dev` runs the frontend and backend API routes locally through Netlify Dev.

## Netlify Setup

1. Connect the GitHub repo to Netlify.
2. Use `pnpm build` as the build command and `.next` as the publish directory.
3. Add `DATABASE_URL`, `REFRESH_SECRET`, and `NEXT_PUBLIC_GA_ID` in Netlify environment variables.
4. After deploy, trigger `POST /api/refresh-news` with header `x-refresh-secret: <your secret>` once.
5. Netlify scheduled function `refresh-news-scheduled` will call the refresh route every hour after that.

## How It Works

- Next.js renders the frontend.
- Next.js route handlers provide `/api/news-feed`, `/api/refresh-news`, `/api/waitlist`, `/api/interest`, and `/api/story-image`.
- Raw RSS articles are stored in `articles`.
- Grouped stories are stored in `stories`, with links to their component articles in `story_articles`.
- The refresh route and script prune articles older than two weeks, regroup the current article set, and update the story tables.
- The homepage reads the prepared stories from `/api/news-feed`.

## Current RSS Source Set

- Hindustan Times
- The Indian Express
- Mint
- The Times of India
- NDTV
- Deccan Herald
