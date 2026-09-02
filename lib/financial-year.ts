// BAGDROP — lib/financial-year.ts
//
// Indian Financial Year: 1 April → 31 March. Built for Branch-Wise LR
// numbering (spec 2026-09-02) — every other number series in this codebase
// (BDA/BDL/BDQ via next_series_number(), the old global BDLR- LR series)
// resets on the plain calendar year (1 January) instead; nothing existing
// to reuse here, this is the first FY-aware logic in the app.
//
// FY label convention matches the spec's own examples exactly:
//   31 March 2027 → FY 2026-27 (the year that STARTED last April)
//   1 April 2027  → FY 2027-28 (a new FY starts)

export interface FinancialYear {
  /** The calendar year the FY started in, e.g. 2026 for FY 2026-27. This is
   *  the value passed as next_branch_lr_seq()'s p_year — see that
   *  function's comment in supabase/migrations/20260902_branch_wise_lr.sql
   *  for why an explicit start-year (not the raw calendar year of "today")
   *  is required to keep one FY's sequence from fragmenting at Jan 1. */
  startYear: number
  /** Human-readable label, e.g. "2026-27". */
  label: string
}

export function indianFinancialYear(date: Date = new Date()): FinancialYear {
  const month = date.getMonth() // 0 = January … 11 = December
  const year  = date.getFullYear()
  // Jan/Feb/Mar (month 0-2) belong to the FY that started the PREVIOUS
  // April; Apr onward (month 3-11) belong to the FY starting THIS April.
  const startYear = month >= 3 ? year : year - 1
  const label = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
  return { startYear, label }
}
