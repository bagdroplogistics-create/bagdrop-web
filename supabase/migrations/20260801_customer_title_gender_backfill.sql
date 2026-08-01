-- ================================================================
-- Bagdrop — Corrective Title backfill for legacy records
-- Run in Supabase SQL Editor: https://supabase.com/dashboard
-- ================================================================
--
-- WHY THIS EXISTS
-- 20260801_customer_title.sql added a `title` column to bookings,
-- leads, quotes, invoices, and payments and defaulted every EXISTING
-- row (i.e. every record created before that migration ran) to
-- 'Mr.' — this was the originally-specified behavior ("default
-- existing customer records without a title to Mr., admin can edit
-- later"). In practice this means every legacy record shows "Mr."
-- regardless of the customer's actual name — e.g. "Mr. Neha Rathee",
-- "Mr. Amita Doshi", "Mr. Purnima Desai" — which is wrong and
-- misleading, even though it was technically "working as designed."
--
-- WHAT THIS SCRIPT DOES
-- One-time, best-effort corrective pass. For each of the 5 tables,
-- it flips title from 'Mr.' to 'Ms.' ONLY when:
--   1. The row is still at the untouched default (title = 'Mr.')
--      — rows an admin has already explicitly edited to Mr./Mrs./Ms.
--        after this feature launched are not touched either way,
--        since we can't tell "explicitly chosen Mr." apart from
--        "defaulted to Mr." without this heuristic anyway; this is
--        the same limitation any name-based backfill has.
--   2. The first word of customer_name matches a name in the curated
--      FEMALE_FIRST_NAMES list below (case-insensitive).
--   3. customer_name does NOT look like a business/organization name
--      (PVT LTD, LLP, Enterprises, Traders, etc. are excluded — a
--      company has no gender, so it's left as-is for manual review).
--
-- This is a HEURISTIC, not a certainty. It cannot know marital status
-- (so it always guesses 'Ms.', never 'Mrs.'), and it will miss any
-- name not in the list below (still shows 'Mr.' afterwards) or
-- occasionally mis-tag a genuinely unisex name. Review the SELECT
-- preview below before running the UPDATEs, and spot-check the
-- "still needs review" query at the bottom afterwards. Any row can
-- always be corrected by hand afterwards via the existing Lead /
-- Quote / Booking edit forms (Title dropdown), which is unaffected
-- by this script either way.
--
-- SAFE TO RE-RUN: rows already changed to 'Ms.' no longer match
-- `title = 'Mr.'`, so running this twice is a no-op the second time.
-- ================================================================

-- ---------------------------------------------------------------
-- STEP 0 — curated list of common Indian + international female
-- first names. Add more names here any time you spot a record this
-- pass missed, then re-run just the relevant UPDATE below.
-- ---------------------------------------------------------------
CREATE TEMP TABLE female_first_names (name text);
INSERT INTO female_first_names (name) VALUES
  ('priya'),('neha'),('pooja'),('anjali'),('kavita'),('sunita'),('meera'),('sneha'),
  ('divya'),('ritu'),('anita'),('nisha'),('swati'),('deepa'),('rekha'),('usha'),
  ('geeta'),('seema'),('shweta'),('vandana'),('aarti'),('arti'),('aparna'),('bhavna'),
  ('bhavana'),('chitra'),('darshana'),('falguni'),('hetal'),('ila'),('jyoti'),('kajal'),
  ('lata'),('madhuri'),('nalini'),('payal'),('radha'),('sangeeta'),('trupti'),('urvashi'),
  ('vaishali'),('yamini'),('mansi'),('nikita'),('pallavi'),('ragini'),('sonal'),('trisha'),
  ('varsha'),('aisha'),('fatima'),('sana'),('ayesha'),('zara'),('amita'),('rupali'),
  ('purnima'),('poornima'),('kiran'),('preeti'),('priti'),('shilpa'),('sonia'),('sunanda'),
  ('sudha'),('vidya'),('yogita'),('reema'),('rima'),('simran'),('sarika'),('sarita'),
  ('shobha'),('shobhna'),('smita'),('vaidehi'),('vibha'),('vinita'),('roshni'),('ruchi'),
  ('ruchika'),('rutuja'),('sakshi'),('samiksha'),('sejal'),('shefali'),('sheetal'),('shital'),
  ('shraddha'),('sindhu'),('sonam'),('sujata'),('surbhi'),('tanvi'),('tanya'),('tejal'),
  ('urmila'),('vidhi'),('zeenat'),('alka'),('anagha'),('anisha'),('archana'),
  ('asha'),('bina'),('binita'),('bhumika'),('charu'),('daksha'),('damini'),('dimple'),
  ('dipika'),('deepika'),('drashti'),('foram'),('gauri'),('gayatri'),('hansa'),('harshita'),
  ('heena'),('hina'),('indu'),('ishita'),('jagruti'),('jaya'),('jigisha'),('juhi'),
  ('kalpana'),('kamini'),('kanchan'),('karishma'),('karuna'),('khushbu'),('khushi'),('komal'),
  ('krupa'),('kruti'),('kusum'),('leena'),('lina'),('mala'),('mamta'),
  ('manisha'),('manju'),('meena'),('minal'),('mital'),('mitali'),('monika'),('mrunal'),
  ('mrunali'),('namrata'),('nandini'),('nayana'),('neelam'),('neeta'),('niti'),('nupur'),
  ('padma'),('pankti'),('parul'),('pinky'),('poonam'),('pratiksha'),('pratima'),
  ('priyal'),('priyanka'),('rachana'),('rachna'),('rachita'),('rajni'),('rashi'),
  ('rashmi'),('renu'),('reshma'),('richa'),('rina'),('riddhi'),('rohini'),('roopa'),
  ('rupa'),('sadhna'),('sadhana'),('sameera'),('sanjana'),('sarla'),('savita'),('shalini'),
  ('shama'),('shanta'),('sharda'),('sharmila'),('shilpi'),('shivani'),
  ('shreya'),('shruti'),('shubhangi'),('shubhi'),('sonali'),('sulekha'),
  ('supriya'),('sushma'),('tanuja'),('tara'),('tasneem'),('tina'),
  ('tripti'),('twinkle'),('uma'),('urvi'),('vaishnavi'),
  ('vasudha'),('veena'),('vineeta'),('yashvi'),('yesha'),('yuvika'),
  ('zainab'),('aditi'),('akansha'),('akanksha'),('alisha'),('alpa'),('amisha'),('ami'),
  ('amrita'),('anushka'),('apeksha'),('apoorva'),('avni'),('bansi'),('bela'),('bhairavi'),
  ('bindi'),('chandni'),('charmi'),('chhaya'),('devika'),('disha'),('diti'),('drishti'),
  ('ekta'),('gargi'),('garima'),('gunjan'),('harleen'),('harsha'),('hemal'),('hemangi'),
  ('hetvi'),('ishani'),('janki'),('janvi'),('jhanvi'),('jinal'),('kajol'),('kanika'),
  ('kavya'),('keerti'),('khyati'),('kimaya'),('krisha'),('krishna'),('kriti'),('kritika'),
  ('kshama'),('lavanya'),('maitri'),('malti'),('maya'),('megha'),('mehak'),
  ('milan'),('mili'),('mona'),('naina'),('naisha'),('nandita'),('naomi'),('nayantara'),
  ('nazia'),('neelima'),('neerja'),('nehal'),('nidhi'),('nikki'),('nimisha'),('niral'),
  ('nishtha'),('nita'),('palak'),('pari'),('parineeta'),('parisha'),
  ('poornima'),('pragya'),('prakriti'),('prapti'),('prisha'),('purvi'),
  ('rajvi'),('rakhi'),('rani'),('rasika'),('raveena'),('reet'),('reeva'),('renuka'),
  ('riya'),('roshan'),('ruhi'),('sagarika'),('saloni'),('samta'),
  ('sanya'),('sapna'),('sarah'),('shaina'),('shivangi'),('shrishti'),
  ('siddhi'),('simar'),('snigdha'),('sonakshi'),('sonu'),('sristi'),('suhani'),
  ('sushila'),('svara'),('taniya'),('tanisha'),('tanushree'),('tejaswini'),('trishala'),
  ('urja'),('urshila'),('vaani'),('vandita'),('vanshika'),('varda'),
  ('vidisha'),('vrinda'),('yachna'),('yashika'),('zoya')
;

-- Reusable exclusion pattern: skip anything that looks like a
-- company / organization rather than a person.
-- (kept inline in each WHERE clause since Postgres has no shared
-- session variable for a regex literal without a function)

-- ---------------------------------------------------------------
-- STEP 1 — PREVIEW (read-only). Run this first and eyeball the
-- results before running the UPDATEs in Step 2.
-- ---------------------------------------------------------------
SELECT 'bookings' AS table_name, id, tracking_id, customer_name, title
FROM bookings
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) IN (SELECT name FROM female_first_names)
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)'

UNION ALL

SELECT 'leads', id, lead_number, name, title
FROM leads
WHERE title = 'Mr.'
  AND lower(split_part(trim(name), ' ', 1)) IN (SELECT name FROM female_first_names)
  AND name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)'

UNION ALL

SELECT 'quotes', id, quote_number, customer_name, title
FROM quotes
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) IN (SELECT name FROM female_first_names)
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)'

UNION ALL

SELECT 'invoices', id, invoice_number, customer_name, title
FROM invoices
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) IN (SELECT name FROM female_first_names)
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)'

UNION ALL

SELECT 'payments', id, payment_id, customer_name, title
FROM payments
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) IN (SELECT name FROM female_first_names)
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

-- ---------------------------------------------------------------
-- STEP 2 — APPLY. Once the preview above looks right, run these
-- five UPDATEs (each mirrors its preview clause exactly).
-- ---------------------------------------------------------------
UPDATE bookings
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) IN (SELECT name FROM female_first_names)
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE leads
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(name), ' ', 1)) IN (SELECT name FROM female_first_names)
  AND name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE quotes
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) IN (SELECT name FROM female_first_names)
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE invoices
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) IN (SELECT name FROM female_first_names)
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE payments
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) IN (SELECT name FROM female_first_names)
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

-- ---------------------------------------------------------------
-- STEP 3 — remaining rows still at 'Mr.' whose first name ISN'T
-- in the dictionary above. These need a human eye — could be a
-- correctly-male name, an unlisted female name, a company, or a
-- single ambiguous/initial-only entry. Fix any of these directly
-- in the admin UI (Lead / Quote / Booking edit → Title dropdown).
-- ---------------------------------------------------------------
SELECT 'bookings' AS table_name, id, tracking_id, customer_name, title FROM bookings WHERE title = 'Mr.'
UNION ALL
SELECT 'leads', id, lead_number, name, title FROM leads WHERE title = 'Mr.'
UNION ALL
SELECT 'quotes', id, quote_number, customer_name, title FROM quotes WHERE title = 'Mr.'
ORDER BY 1, 3;

DROP TABLE female_first_names;
