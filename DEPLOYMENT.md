## Netlify Setup

1. Install dependencies with `npm install`.
2. Deploy to Netlify.
3. Add environment variable `REFRESH_SECRET` in Netlify.
4. After first deploy, trigger `POST /api/refresh-news` with header `x-refresh-secret: <your secret>` once to create the first snapshot.
5. Netlify scheduled function `refresh-news-scheduled` will refresh the feed every hour after that.

## How It Works

- `refresh-news-scheduled` runs hourly.
- It calls `refresh-news-background`.
- The background function fetches RSS feeds, groups overlapping stories, ranks them, and stores the result in Netlify Blobs.
- `news-feed` returns the latest stored snapshot to the homepage.

## Current RSS Source Set

- Hindustan Times
- The Indian Express
- Mint
- The Times of India
- NDTV
- Deccan Herald
