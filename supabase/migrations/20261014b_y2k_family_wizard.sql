-- Y2K multi-step family booking: structured snapshot + per-guest / per-bag detail.
-- Additive only. Existing rows and columns are untouched.
ALTER TABLE bookings   ADD COLUMN IF NOT EXISTS family_details jsonb;   -- full validated wizard snapshot (members, pickups, bags, return plan)
ALTER TABLE group_guests ADD COLUMN IF NOT EXISTS member_ref text;      -- wizard id, e.g. G01 (links bags to guests)
ALTER TABLE group_guests ADD COLUMN IF NOT EXISTS travel jsonb;         -- arrival / departure / travel number
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS bag_type text;          -- large | medium | small
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS colour text;
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS identifying_mark text;
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS weight_band text;
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS contents text;
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS deliver_to text;
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS handling jsonb;         -- { hang, fragile }
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS pickup_ref text;        -- wizard pickup id, e.g. P1
ALTER TABLE group_bags ADD COLUMN IF NOT EXISTS return_plan jsonb;      -- { ret, slot, dest, address }
