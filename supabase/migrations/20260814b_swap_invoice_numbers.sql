-- BAGDROP — Atomic invoice-number swap (manual correction tool)
--
-- Real-world scenario this exists for: an admin clicked "Generate Invoice"
-- on a later (e.g. August) inquiry before an earlier (July) one, so the
-- earlier inquiry lost its rightful place in the BLS26 series. Swapping is
-- the only correction that never wastes/duplicates a number and never
-- needs to touch the bagdrop_invoice_seq sequence at all — the two
-- invoice_number values just trade places between the two existing rows.
--
-- Done as a single Postgres function (not two sequential JS .update()
-- calls) specifically because invoices.invoice_number has a UNIQUE
-- constraint: a naive "set A to B's number" then "set B to A's number"
-- from application code would fail on the first statement (both rows
-- would briefly hold the same value) unless done through a temporary
-- placeholder inside one transaction — a plpgsql function body already
-- runs as a single transaction, so this is safe by construction.
--
-- Run this in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION swap_invoice_numbers(id_a uuid, id_b uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  num_a text;
  num_b text;
BEGIN
  SELECT invoice_number INTO num_a FROM invoices WHERE id = id_a;
  SELECT invoice_number INTO num_b FROM invoices WHERE id = id_b;

  IF num_a IS NULL OR num_b IS NULL THEN
    RAISE EXCEPTION 'Both invoices must already have an invoice_number to swap';
  END IF;

  -- Temporary placeholder, guaranteed unique (uuid) — sidesteps the UNIQUE
  -- constraint for the moment both real numbers would otherwise collide.
  UPDATE invoices SET invoice_number = 'SWAP-' || gen_random_uuid()::text WHERE id = id_a;
  UPDATE invoices SET invoice_number = num_a WHERE id = id_b;
  UPDATE invoices SET invoice_number = num_b WHERE id = id_a;
END;
$$;
