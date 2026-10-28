This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Daily automatic sync

`vercel.json` schedules `/api/cron/auto-sync` once daily at `0 7 * * *`
(07:00 UTC), compatible with the Vercel Hobby plan. Hobby execution can occur
anywhere in the scheduled hour, so this is not an exact local-time guarantee.
Set `CRON_SECRET` in the Vercel project's environment variables; Vercel sends
it as the bearer token when invoking the route.

The job syncs active Strava and WHOOP accounts with a 14-day lookback. It skips
providers that already successfully synced since the start of the user's local
calendar day. Manual sync remains available. Automatic sync runs on a shared
UTC schedule rather than at 11 p.m. in each user's timezone.
