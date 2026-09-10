ALTER TYPE "BookingType" RENAME TO "BookingType_old";

CREATE TYPE "BookingType" AS ENUM (
  'ONLINE_PLAYHOUSE',
  'WALKIN_PLAYHOUSE',
  'ONLINE_BIRTHDAY',
  'WALKIN_BIRTHDAY',
  'UNKNOWN'
);

ALTER TABLE "bookings" ALTER COLUMN "booking_type" DROP DEFAULT;

ALTER TABLE "bookings"
  ALTER COLUMN "booking_type" TYPE "BookingType"
  USING (
    CASE "booking_type"::text
      WHEN 'ONLINE' THEN 'ONLINE_PLAYHOUSE'
      WHEN 'WALK_IN' THEN 'WALKIN_PLAYHOUSE'
      WHEN 'UNKNOWN' THEN 'UNKNOWN'
      ELSE 'UNKNOWN'
    END
  )::"BookingType";

ALTER TABLE "bookings" ALTER COLUMN "booking_type" SET DEFAULT 'UNKNOWN';

DROP TYPE "BookingType_old";
