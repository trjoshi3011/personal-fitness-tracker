-- Multi-user fix: make Strava activity IDs unique per user

DROP INDEX IF EXISTS "StravaActivity_providerActivityId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "StravaActivity_userId_providerActivityId_key" ON "StravaActivity"("userId", "providerActivityId");
