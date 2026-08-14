-- BAGDROP — Local, atomic invoice numbering (continues the Zoho series)
--
-- Context: BLS2600042 was the last invoice actually created in Zoho Books.
-- From here on we've stopped creating invoices in Zoho — every NEW invoice
-- number is now assigned locally, atomically, via a native Postgres
-- sequence (Postgres sequences are safe under concurrent access by design:
-- nextval() never hands out the same value twice, even under concurrent
-- transactions, and never blocks/locks — exactly the "no duplicates, no
-- reassigns on retry" guarantee this needs).
--
-- Format: "BLS26" + a 5-digit zero-padded running number — matches the
-- exact format visible on the reference invoice (BLS2600042 = "BLS26" +
-- "00042", 5 digits, not 6 — verified against the actual uploaded PDF).
-- Sequence starts at 43 so the very first locally-assigned number is
-- BLS2600043, continuing on immediately after the last real Zoho number.
--
-- Run this in the Supabase SQL editor.

CREATE SEQUENCE IF NOT EXISTS bagdrop_invoice_seq
  START WITH 43
  INCREMENT BY 1
  NO CYCLE;

-- SECURITY DEFINER so it can be called via supabaseAdmin.rpc(...) with the
-- service-role key exactly like any other RPC in this codebase; the
-- function only ever touches the sequence, never any table, so there's no
-- privilege-escalation surface here.
CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('bagdrop_invoice_seq');
  RETURN 'BLS26' || lpad(n::text, 5, '0');
END;
$$;

-- Salesperson / referring-agent name shown as "P.O.#" on the invoice PDF
-- (matches the Zoho-style reference layout's P.O.# field) — snapshotted
-- from the lead at generation time, same pattern as consignment_no /
-- pickup_date / delivery_date already on this table.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS po_number text;
