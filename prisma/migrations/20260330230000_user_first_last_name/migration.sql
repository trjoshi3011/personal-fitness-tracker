-- Split User.name into User.firstName and User.lastName.
ALTER TABLE "User"
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT;

-- Backfill from existing name values when available.
UPDATE "User"
SET
  "firstName" = CASE
    WHEN "name" IS NULL OR btrim("name") = '' THEN NULL
    ELSE split_part(btrim("name"), ' ', 1)
  END,
  "lastName" = CASE
    WHEN "name" IS NULL OR btrim("name") = '' THEN NULL
    WHEN strpos(btrim("name"), ' ') = 0 THEN NULL
    ELSE NULLIF(btrim(substring(btrim("name") from length(split_part(btrim("name"), ' ', 1)) + 1)), '')
  END;

ALTER TABLE "User" DROP COLUMN "name";
