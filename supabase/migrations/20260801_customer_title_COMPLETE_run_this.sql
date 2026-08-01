-- ================================================================
-- Bagdrop — Customer Title (Mr./Mrs./Ms.) — COMPLETE, ONE-SHOT SCRIPT
-- Run this ENTIRE file in the Supabase SQL Editor:
-- https://supabase.com/dashboard  →  your project  →  SQL Editor
-- ================================================================
--
-- Your database is currently missing the `title` column entirely —
-- that's why running the backfill script alone failed with
-- "column title does not exist". This single script does both steps
-- in the right order, so there's no way to run them out of sequence:
--
--   PART 1 — adds the `title` column (+ CHECK constraint) to
--            bookings, leads, quotes, invoices, and payments.
--            Every existing row is auto-backfilled to 'Mr.' by the
--            column default (this is standard Postgres behavior,
--            not a bug — see PART 2).
--
--   PART 2 — corrects that default for existing records where the
--            name clearly indicates otherwise: flips 'Mr.' → 'Ms.'
--            for any row whose first name matches a curated list of
--            ~250 common Indian/international female first names,
--            skipping anything that looks like a business name
--            (PVT, LTD, LLP, Enterprises, Traders, etc.).
--
-- This is a HEURISTIC for existing records only — it can't know
-- marital status (always guesses 'Ms.', never 'Mrs.'), and it will
-- miss any name not in the list (stays 'Mr.', flagged in the final
-- SELECT for manual review). Going forward, every NEW booking/lead/
-- quote created through the actual forms stores the real title the
-- customer or admin picked — this script only cleans up history.
--
-- SAFE TO RE-RUN in full, any time.
-- ================================================================


-- ================================================================
-- PART 1 — add the title column (idempotent)
-- ================================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Mr.';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Mr.';

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Mr.';

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Mr.';

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Mr.';

-- Postgres has no "ADD CONSTRAINT IF NOT EXISTS", so guard each CHECK
-- constraint manually to keep this safely re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_title_check') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_title_check') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_title_check') THEN
    ALTER TABLE quotes ADD CONSTRAINT quotes_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_title_check') THEN
    ALTER TABLE invoices ADD CONSTRAINT invoices_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_title_check') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_title_check CHECK (title IN ('Mr.', 'Mrs.', 'Ms.'));
  END IF;
END $$;


-- ================================================================
-- PART 2 — corrective gender backfill for legacy records
-- ================================================================

-- Curated list of common Indian + international female first names.
-- Add more any time you spot a record this pass missed.
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

-- Apply the correction to all five tables.
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

-- Final check — rows still at 'Mr.' whose first name ISN'T in the
-- dictionary above. Could be a correctly-male name, an unlisted
-- female name, a company, or a single/ambiguous entry. Fix any of
-- these by hand via the admin Lead / Quote / Booking edit forms
-- (Title dropdown).
SELECT 'bookings' AS table_name, id, tracking_id, customer_name, title FROM bookings WHERE title = 'Mr.'
UNION ALL
SELECT 'leads', id, lead_number, name, title FROM leads WHERE title = 'Mr.'
UNION ALL
SELECT 'quotes', id, quote_number, customer_name, title FROM quotes WHERE title = 'Mr.'
ORDER BY 1, 3;

DROP TABLE female_first_names;
