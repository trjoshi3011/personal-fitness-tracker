-- Per-user HR zone profile (max, rest, scheme).
ALTER TABLE "User"
  ADD COLUMN "hrMaxBpm"     INTEGER,
  ADD COLUMN "hrRestBpm"    INTEGER,
  ADD COLUMN "hrZoneScheme" TEXT NOT NULL DEFAULT 'percent_max';

-- Cached per-activity time-in-zone breakdown (so we don't refetch streams).
CREATE TABLE "StravaActivityHrZones" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "providerActivityId" TEXT NOT NULL,
  "schemeKey" TEXT NOT NULL,
  "hrMaxBpm" INTEGER NOT NULL,
  "hrRestBpm" INTEGER,
  "zoneEdgesBpm" JSONB NOT NULL,
  "zoneDurationsSec" JSONB NOT NULL,
  "totalSeconds" INTEGER NOT NULL,
  "observedMaxBpm" INTEGER,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StravaActivityHrZones_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "StravaActivityHrZones_userId_providerActivityId_key"
  ON "StravaActivityHrZones" ("userId", "providerActivityId");

CREATE INDEX "StravaActivityHrZones_userId_computedAt_idx"
  ON "StravaActivityHrZones" ("userId", "computedAt");
