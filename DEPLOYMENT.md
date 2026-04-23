## Local Setup

1. Install dependencies with `pnpm install`.
2. Create `.env.local` from `.env.example`.
3. Paste your Neon connection string into `DATABASE_URL`.
4. Set `REFRESH_SECRET` to any local secret.
5. Run `pnpm db:migrate` to create the Postgres tables.
6. Run `pnpm refresh:news` to fetch RSS stories and store the first snapshot.
7. Run `pnpm dev` and open the Netlify Dev URL.

## Local Test Flow Before Pushing

- `pnpm db:migrate` verifies the Neon database connection and schema.
- `pnpm refresh:news` verifies RSS ingestion, grouping, and Postgres writes.
- `pnpm build` verifies the Next.js production build.
- `pnpm dev` runs the frontend and backend API routes locally through Netlify Dev.

## Netlify Setup

1. Connect the GitHub repo to Netlify.
2. Use `pnpm build` as the build command and `.next` as the publish directory.
3. Add `DATABASE_URL`, `REFRESH_SECRET`, and `NEXT_PUBLIC_GA_ID` in Netlify environment variables.
4. After deploy, trigger `POST /api/refresh-news` with header `x-refresh-secret: <your secret>`.

## How It Works

- Next.js renders the frontend.
- Next.js route handlers provide `/api/news-feed`, `/api/refresh-news`, `/api/waitlist`, `/api/interest`, and `/api/story-image`.
- The refresh route and script fetch RSS feeds, group overlapping stories, rank them, and store the latest snapshot in Neon Postgres.
- The homepage reads the prepared snapshot from `/api/news-feed`.

## Current RSS Source Set

- Hindustan Times
- The Indian Express
- Mint
- The Times of India
- NDTV
- Deccan Herald
