-- Fix: next_branch_lr_seq() failed with
--   column reference "series" is ambiguous
-- because its local variable was named `series`, the same as the
-- bagdrop_number_counters.series column used in ON CONFLICT (series, year).
-- Variables renamed (v_series / v_seq); behaviour is otherwise identical.
-- Run in Supabase Dashboard → SQL Editor.
CREATE OR REPLACE FUNCTION next_branch_lr_seq(p_branch_code text, p_year int, p_width int DEFAULT 6)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_series text := p_branch_code || '-LR';
  v_seq    int;
BEGIN
  INSERT INTO bagdrop_number_counters AS c (series, year, last_seq)
  VALUES (v_series, p_year, 1)
  ON CONFLICT (series, year)
  DO UPDATE SET last_seq = c.last_seq + 1
  RETURNING c.last_seq INTO v_seq;

  RETURN lpad(v_seq::text, p_width, '0');
END;
$$;
