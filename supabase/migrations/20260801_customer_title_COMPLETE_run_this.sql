-- ================================================================
-- Bagdrop — Customer Title (Mr./Mrs./Ms.) — COMPLETE, ONE-SHOT SCRIPT
-- Run this ENTIRE file in the Supabase SQL Editor:
-- https://supabase.com/dashboard  →  your project  →  SQL Editor
-- ================================================================
--
-- Your database was missing the `title` column entirely — that's why
-- the backfill-only script failed with "column title does not
-- exist". A later attempt failed with "relation female_first_names
-- does not exist" (Supabase's SQL editor runs each statement on its
-- own connection, so temp tables/CTEs don't survive between
-- statements) — fixed by inlining the name list into every UPDATE.
--
-- This version additionally fixes two more misclassification modes
-- found after the first run:
--   1. Names missing from the dictionary (e.g. Moni, Unisha, Rupal,
--      Kavitha, Mouly, Vaijayanti, Hemali) — added below, plus a
--      batch of common South Indian female first names.
--   2. Records where the title was typed directly into the name
--      field itself instead of a separate column (e.g. customer_name
--      = "MRS. BAJAJ ASHNA ANUJ" or "MS. NANDITA") — PART 2a below
--      detects an embedded Mr./Mrs./Ms. token as the first word and
--      trusts it directly, since that's a stronger signal than any
--      name-dictionary guess.
--
--   PART 1  — adds the `title` column (+ CHECK constraint) to
--             bookings, leads, quotes, invoices, and payments.
--             Every existing row is auto-backfilled to 'Mr.' by the
--             column default (standard Postgres behavior).
--
--   PART 2a — if the customer_name/name field itself starts with an
--             embedded "Mr."/"Mrs."/"Ms." token (with or without the
--             period), trust that token directly as the real title.
--
--   PART 2b — for everything else still at the 'Mr.' default, flips
--             to 'Ms.' when the first word matches a curated list of
--             ~400 common Indian/international female first names,
--             skipping anything that looks like a business name.
--
-- This is a HEURISTIC for existing records only — it can't know
-- marital status (so PART 2b always guesses 'Ms.', never 'Mrs.'),
-- and it will still miss any name not in the list (stays 'Mr.',
-- flagged in the final SELECT for manual review). Going forward,
-- every NEW booking/lead/quote created through the actual forms
-- stores the real title the customer or admin picked — this script
-- only cleans up history.
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
-- PART 2a — trust an embedded title token typed into the name field
-- itself (e.g. "MRS. BAJAJ ASHNA ANUJ", "MS. NANDITA"). Runs before
-- the name-dictionary heuristic since this is a direct signal, not
-- a guess. Matches "mr"/"mrs"/"ms" as the first word regardless of
-- trailing period or case.
-- ================================================================
UPDATE bookings
SET title = CASE lower(regexp_replace(split_part(trim(customer_name), ' ', 1), '\.', '', 'g'))
  WHEN 'mrs' THEN 'Mrs.'
  WHEN 'ms'  THEN 'Ms.'
  WHEN 'mr'  THEN 'Mr.'
END
WHERE title = 'Mr.'
  AND lower(regexp_replace(split_part(trim(customer_name), ' ', 1), '\.', '', 'g')) IN ('mr', 'mrs', 'ms');

UPDATE leads
SET title = CASE lower(regexp_replace(split_part(trim(name), ' ', 1), '\.', '', 'g'))
  WHEN 'mrs' THEN 'Mrs.'
  WHEN 'ms'  THEN 'Ms.'
  WHEN 'mr'  THEN 'Mr.'
END
WHERE title = 'Mr.'
  AND lower(regexp_replace(split_part(trim(name), ' ', 1), '\.', '', 'g')) IN ('mr', 'mrs', 'ms');

UPDATE quotes
SET title = CASE lower(regexp_replace(split_part(trim(customer_name), ' ', 1), '\.', '', 'g'))
  WHEN 'mrs' THEN 'Mrs.'
  WHEN 'ms'  THEN 'Ms.'
  WHEN 'mr'  THEN 'Mr.'
END
WHERE title = 'Mr.'
  AND lower(regexp_replace(split_part(trim(customer_name), ' ', 1), '\.', '', 'g')) IN ('mr', 'mrs', 'ms');

UPDATE invoices
SET title = CASE lower(regexp_replace(split_part(trim(customer_name), ' ', 1), '\.', '', 'g'))
  WHEN 'mrs' THEN 'Mrs.'
  WHEN 'ms'  THEN 'Ms.'
  WHEN 'mr'  THEN 'Mr.'
END
WHERE title = 'Mr.'
  AND lower(regexp_replace(split_part(trim(customer_name), ' ', 1), '\.', '', 'g')) IN ('mr', 'mrs', 'ms');

UPDATE payments
SET title = CASE lower(regexp_replace(split_part(trim(customer_name), ' ', 1), '\.', '', 'g'))
  WHEN 'mrs' THEN 'Mrs.'
  WHEN 'ms'  THEN 'Ms.'
  WHEN 'mr'  THEN 'Mr.'
END
WHERE title = 'Mr.'
  AND lower(regexp_replace(split_part(trim(customer_name), ' ', 1), '\.', '', 'g')) IN ('mr', 'mrs', 'ms');


-- ================================================================
-- PART 2b — corrective gender backfill for legacy records still at
-- the 'Mr.' default. Each statement is fully self-contained (no temp
-- table, no CTE) — the same female-name array is inlined into every
-- UPDATE, since Supabase's SQL editor doesn't share state across
-- statements.
-- ================================================================
UPDATE bookings
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) = ANY (ARRAY[
    'aarti','aditi','aisha','akanksha','akansha','alisha','alka','alpa',
    'ami','amisha','amita','amrita','anagha','anisha','anita','anitha',
    'anjali','anusha','anushka','aparna','apeksha','apoorva','archana','arti',
    'asha','avni','ayesha','bansi','bela','bhairavi','bhavana','bhavani',
    'bhavna','bhumika','bina','bindi','binita','chandni','charmi','charu',
    'chhaya','chitra','daksha','damini','darshana','deepa','deepika','devika',
    'dimple','dipika','disha','diti','divya','drashti','drishti','ekta',
    'falguni','fatima','foram','gargi','garima','gauri','gayathri','gayatri',
    'geeta','geetha','gunjan','hansa','harini','haritha','harleen','harsha',
    'harshita','heena','hemal','hemali','hemangi','hetal','hetvi','hina',
    'ila','indira','indu','ishani','ishita','jagruti','janani','janki',
    'janvi','jaya','jayanthi','jhanvi','jigisha','jinal','juhi','jyoti',
    'kajal','kajol','kalpana','kalyani','kamala','kamini','kanchan','kanika',
    'karishma','karuna','kausalya','kavita','kavitha','kavya','keerthana','keerthi',
    'keerti','khushbu','khushi','khyati','kimaya','kiran','komal','krisha',
    'krishna','kriti','kritika','krupa','kruti','kshama','kusum','lakshmi',
    'lakshmipriya','lalitha','lata','latha','lavanya','leena','lina','madhavi',
    'madhuri','maitri','mala','malathi','malini','malti','mamta','manisha',
    'manju','mansi','maya','meena','meenakshi','meera','megha','meghana',
    'mehak','milan','mili','minal','mital','mitali','mona','moni',
    'monika','mouli','mouly','mrunal','mrunali','nagalakshmi','naina','naisha',
    'nalini','namrata','nandini','nandita','naomi','nayana','nayantara','nazia',
    'neelam','neelima','neerja','neeta','neha','nehal','nidhi','nikita',
    'nikki','nimisha','niral','nirmala','nisha','nishtha','nita','nithya',
    'niti','nupur','padma','padmavathi','palak','pallavi','pankti','pari',
    'parineeta','parisha','parul','parvathi','payal','pinky','pooja','poonam',
    'poorna','poornima','pragya','prakriti','pramila','prapti','pratiksha','pratima',
    'preeti','prema','prisha','priti','priya','priyal','priyanka','purnima',
    'purvi','rachana','rachita','rachna','radha','ragini','rajni','rajvi',
    'rakhi','ramya','rani','rashi','rashmi','rasika','raveena','reema',
    'reet','reeva','rekha','renu','renuka','reshma','revathi','richa',
    'riddhi','rima','rina','ritu','riya','rohini','roja','roopa',
    'roshan','roshni','ruchi','ruchika','ruhi','rupa','rupal','rupali',
    'rutuja','sadhana','sadhna','sagarika','sakshi','saloni','sameera','samiksha',
    'samta','sana','sangeeta','sangeetha','sanjana','sanya','sapna','sarada',
    'sarah','saraswathi','sarika','sarita','saritha','sarla','saroja','sathya',
    'savita','savitha','seema','sejal','shailaja','shaina','shalini','shama',
    'shanta','shanthi','sharda','sharmila','sheetal','shefali','shilpa','shilpi',
    'shital','shivangi','shivani','shobha','shobhna','shraddha','shreya','shrishti',
    'shruti','shubhangi','shubhi','shweta','siddhi','simar','simran','sindhu',
    'smita','sneha','snigdha','sonakshi','sonal','sonali','sonam','sonia',
    'sonu','sowmya','sridevi','sristi','subha','sudha','suguna','suhani',
    'sujata','sujatha','sulekha','sumathi','sumati','sunanda','sunita','sunitha',
    'supriya','surbhi','sushila','sushma','suvarna','svara','swarna','swati',
    'swetha','tanisha','taniya','tanuja','tanushree','tanvi','tanya','tara',
    'tasneem','tejal','tejaswini','thara','tina','tripti','trisha','trishala',
    'trupti','twinkle','uma','umadevi','unisha','urja','urmila','urshila',
    'urvashi','urvi','usha','vaani','vaidehi','vaijayanti','vaishali','vaishnavi',
    'valarmathi','valli','vandana','vandita','vani','vanshika','varalakshmi','varda',
    'varsha','vasantha','vasudha','veena','vibha','vidhi','vidisha','vidya',
    'vijayalakshmi','vineeta','vinita','vrinda','yachna','yamini','yashika','yashvi',
    'yesha','yogita','yuvika','zainab','zara','zeenat','zoya'
  ]::text[])
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE leads
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(name), ' ', 1)) = ANY (ARRAY[
    'aarti','aditi','aisha','akanksha','akansha','alisha','alka','alpa',
    'ami','amisha','amita','amrita','anagha','anisha','anita','anitha',
    'anjali','anusha','anushka','aparna','apeksha','apoorva','archana','arti',
    'asha','avni','ayesha','bansi','bela','bhairavi','bhavana','bhavani',
    'bhavna','bhumika','bina','bindi','binita','chandni','charmi','charu',
    'chhaya','chitra','daksha','damini','darshana','deepa','deepika','devika',
    'dimple','dipika','disha','diti','divya','drashti','drishti','ekta',
    'falguni','fatima','foram','gargi','garima','gauri','gayathri','gayatri',
    'geeta','geetha','gunjan','hansa','harini','haritha','harleen','harsha',
    'harshita','heena','hemal','hemali','hemangi','hetal','hetvi','hina',
    'ila','indira','indu','ishani','ishita','jagruti','janani','janki',
    'janvi','jaya','jayanthi','jhanvi','jigisha','jinal','juhi','jyoti',
    'kajal','kajol','kalpana','kalyani','kamala','kamini','kanchan','kanika',
    'karishma','karuna','kausalya','kavita','kavitha','kavya','keerthana','keerthi',
    'keerti','khushbu','khushi','khyati','kimaya','kiran','komal','krisha',
    'krishna','kriti','kritika','krupa','kruti','kshama','kusum','lakshmi',
    'lakshmipriya','lalitha','lata','latha','lavanya','leena','lina','madhavi',
    'madhuri','maitri','mala','malathi','malini','malti','mamta','manisha',
    'manju','mansi','maya','meena','meenakshi','meera','megha','meghana',
    'mehak','milan','mili','minal','mital','mitali','mona','moni',
    'monika','mouli','mouly','mrunal','mrunali','nagalakshmi','naina','naisha',
    'nalini','namrata','nandini','nandita','naomi','nayana','nayantara','nazia',
    'neelam','neelima','neerja','neeta','neha','nehal','nidhi','nikita',
    'nikki','nimisha','niral','nirmala','nisha','nishtha','nita','nithya',
    'niti','nupur','padma','padmavathi','palak','pallavi','pankti','pari',
    'parineeta','parisha','parul','parvathi','payal','pinky','pooja','poonam',
    'poorna','poornima','pragya','prakriti','pramila','prapti','pratiksha','pratima',
    'preeti','prema','prisha','priti','priya','priyal','priyanka','purnima',
    'purvi','rachana','rachita','rachna','radha','ragini','rajni','rajvi',
    'rakhi','ramya','rani','rashi','rashmi','rasika','raveena','reema',
    'reet','reeva','rekha','renu','renuka','reshma','revathi','richa',
    'riddhi','rima','rina','ritu','riya','rohini','roja','roopa',
    'roshan','roshni','ruchi','ruchika','ruhi','rupa','rupal','rupali',
    'rutuja','sadhana','sadhna','sagarika','sakshi','saloni','sameera','samiksha',
    'samta','sana','sangeeta','sangeetha','sanjana','sanya','sapna','sarada',
    'sarah','saraswathi','sarika','sarita','saritha','sarla','saroja','sathya',
    'savita','savitha','seema','sejal','shailaja','shaina','shalini','shama',
    'shanta','shanthi','sharda','sharmila','sheetal','shefali','shilpa','shilpi',
    'shital','shivangi','shivani','shobha','shobhna','shraddha','shreya','shrishti',
    'shruti','shubhangi','shubhi','shweta','siddhi','simar','simran','sindhu',
    'smita','sneha','snigdha','sonakshi','sonal','sonali','sonam','sonia',
    'sonu','sowmya','sridevi','sristi','subha','sudha','suguna','suhani',
    'sujata','sujatha','sulekha','sumathi','sumati','sunanda','sunita','sunitha',
    'supriya','surbhi','sushila','sushma','suvarna','svara','swarna','swati',
    'swetha','tanisha','taniya','tanuja','tanushree','tanvi','tanya','tara',
    'tasneem','tejal','tejaswini','thara','tina','tripti','trisha','trishala',
    'trupti','twinkle','uma','umadevi','unisha','urja','urmila','urshila',
    'urvashi','urvi','usha','vaani','vaidehi','vaijayanti','vaishali','vaishnavi',
    'valarmathi','valli','vandana','vandita','vani','vanshika','varalakshmi','varda',
    'varsha','vasantha','vasudha','veena','vibha','vidhi','vidisha','vidya',
    'vijayalakshmi','vineeta','vinita','vrinda','yachna','yamini','yashika','yashvi',
    'yesha','yogita','yuvika','zainab','zara','zeenat','zoya'
  ]::text[])
  AND name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE quotes
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) = ANY (ARRAY[
    'aarti','aditi','aisha','akanksha','akansha','alisha','alka','alpa',
    'ami','amisha','amita','amrita','anagha','anisha','anita','anitha',
    'anjali','anusha','anushka','aparna','apeksha','apoorva','archana','arti',
    'asha','avni','ayesha','bansi','bela','bhairavi','bhavana','bhavani',
    'bhavna','bhumika','bina','bindi','binita','chandni','charmi','charu',
    'chhaya','chitra','daksha','damini','darshana','deepa','deepika','devika',
    'dimple','dipika','disha','diti','divya','drashti','drishti','ekta',
    'falguni','fatima','foram','gargi','garima','gauri','gayathri','gayatri',
    'geeta','geetha','gunjan','hansa','harini','haritha','harleen','harsha',
    'harshita','heena','hemal','hemali','hemangi','hetal','hetvi','hina',
    'ila','indira','indu','ishani','ishita','jagruti','janani','janki',
    'janvi','jaya','jayanthi','jhanvi','jigisha','jinal','juhi','jyoti',
    'kajal','kajol','kalpana','kalyani','kamala','kamini','kanchan','kanika',
    'karishma','karuna','kausalya','kavita','kavitha','kavya','keerthana','keerthi',
    'keerti','khushbu','khushi','khyati','kimaya','kiran','komal','krisha',
    'krishna','kriti','kritika','krupa','kruti','kshama','kusum','lakshmi',
    'lakshmipriya','lalitha','lata','latha','lavanya','leena','lina','madhavi',
    'madhuri','maitri','mala','malathi','malini','malti','mamta','manisha',
    'manju','mansi','maya','meena','meenakshi','meera','megha','meghana',
    'mehak','milan','mili','minal','mital','mitali','mona','moni',
    'monika','mouli','mouly','mrunal','mrunali','nagalakshmi','naina','naisha',
    'nalini','namrata','nandini','nandita','naomi','nayana','nayantara','nazia',
    'neelam','neelima','neerja','neeta','neha','nehal','nidhi','nikita',
    'nikki','nimisha','niral','nirmala','nisha','nishtha','nita','nithya',
    'niti','nupur','padma','padmavathi','palak','pallavi','pankti','pari',
    'parineeta','parisha','parul','parvathi','payal','pinky','pooja','poonam',
    'poorna','poornima','pragya','prakriti','pramila','prapti','pratiksha','pratima',
    'preeti','prema','prisha','priti','priya','priyal','priyanka','purnima',
    'purvi','rachana','rachita','rachna','radha','ragini','rajni','rajvi',
    'rakhi','ramya','rani','rashi','rashmi','rasika','raveena','reema',
    'reet','reeva','rekha','renu','renuka','reshma','revathi','richa',
    'riddhi','rima','rina','ritu','riya','rohini','roja','roopa',
    'roshan','roshni','ruchi','ruchika','ruhi','rupa','rupal','rupali',
    'rutuja','sadhana','sadhna','sagarika','sakshi','saloni','sameera','samiksha',
    'samta','sana','sangeeta','sangeetha','sanjana','sanya','sapna','sarada',
    'sarah','saraswathi','sarika','sarita','saritha','sarla','saroja','sathya',
    'savita','savitha','seema','sejal','shailaja','shaina','shalini','shama',
    'shanta','shanthi','sharda','sharmila','sheetal','shefali','shilpa','shilpi',
    'shital','shivangi','shivani','shobha','shobhna','shraddha','shreya','shrishti',
    'shruti','shubhangi','shubhi','shweta','siddhi','simar','simran','sindhu',
    'smita','sneha','snigdha','sonakshi','sonal','sonali','sonam','sonia',
    'sonu','sowmya','sridevi','sristi','subha','sudha','suguna','suhani',
    'sujata','sujatha','sulekha','sumathi','sumati','sunanda','sunita','sunitha',
    'supriya','surbhi','sushila','sushma','suvarna','svara','swarna','swati',
    'swetha','tanisha','taniya','tanuja','tanushree','tanvi','tanya','tara',
    'tasneem','tejal','tejaswini','thara','tina','tripti','trisha','trishala',
    'trupti','twinkle','uma','umadevi','unisha','urja','urmila','urshila',
    'urvashi','urvi','usha','vaani','vaidehi','vaijayanti','vaishali','vaishnavi',
    'valarmathi','valli','vandana','vandita','vani','vanshika','varalakshmi','varda',
    'varsha','vasantha','vasudha','veena','vibha','vidhi','vidisha','vidya',
    'vijayalakshmi','vineeta','vinita','vrinda','yachna','yamini','yashika','yashvi',
    'yesha','yogita','yuvika','zainab','zara','zeenat','zoya'
  ]::text[])
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE invoices
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) = ANY (ARRAY[
    'aarti','aditi','aisha','akanksha','akansha','alisha','alka','alpa',
    'ami','amisha','amita','amrita','anagha','anisha','anita','anitha',
    'anjali','anusha','anushka','aparna','apeksha','apoorva','archana','arti',
    'asha','avni','ayesha','bansi','bela','bhairavi','bhavana','bhavani',
    'bhavna','bhumika','bina','bindi','binita','chandni','charmi','charu',
    'chhaya','chitra','daksha','damini','darshana','deepa','deepika','devika',
    'dimple','dipika','disha','diti','divya','drashti','drishti','ekta',
    'falguni','fatima','foram','gargi','garima','gauri','gayathri','gayatri',
    'geeta','geetha','gunjan','hansa','harini','haritha','harleen','harsha',
    'harshita','heena','hemal','hemali','hemangi','hetal','hetvi','hina',
    'ila','indira','indu','ishani','ishita','jagruti','janani','janki',
    'janvi','jaya','jayanthi','jhanvi','jigisha','jinal','juhi','jyoti',
    'kajal','kajol','kalpana','kalyani','kamala','kamini','kanchan','kanika',
    'karishma','karuna','kausalya','kavita','kavitha','kavya','keerthana','keerthi',
    'keerti','khushbu','khushi','khyati','kimaya','kiran','komal','krisha',
    'krishna','kriti','kritika','krupa','kruti','kshama','kusum','lakshmi',
    'lakshmipriya','lalitha','lata','latha','lavanya','leena','lina','madhavi',
    'madhuri','maitri','mala','malathi','malini','malti','mamta','manisha',
    'manju','mansi','maya','meena','meenakshi','meera','megha','meghana',
    'mehak','milan','mili','minal','mital','mitali','mona','moni',
    'monika','mouli','mouly','mrunal','mrunali','nagalakshmi','naina','naisha',
    'nalini','namrata','nandini','nandita','naomi','nayana','nayantara','nazia',
    'neelam','neelima','neerja','neeta','neha','nehal','nidhi','nikita',
    'nikki','nimisha','niral','nirmala','nisha','nishtha','nita','nithya',
    'niti','nupur','padma','padmavathi','palak','pallavi','pankti','pari',
    'parineeta','parisha','parul','parvathi','payal','pinky','pooja','poonam',
    'poorna','poornima','pragya','prakriti','pramila','prapti','pratiksha','pratima',
    'preeti','prema','prisha','priti','priya','priyal','priyanka','purnima',
    'purvi','rachana','rachita','rachna','radha','ragini','rajni','rajvi',
    'rakhi','ramya','rani','rashi','rashmi','rasika','raveena','reema',
    'reet','reeva','rekha','renu','renuka','reshma','revathi','richa',
    'riddhi','rima','rina','ritu','riya','rohini','roja','roopa',
    'roshan','roshni','ruchi','ruchika','ruhi','rupa','rupal','rupali',
    'rutuja','sadhana','sadhna','sagarika','sakshi','saloni','sameera','samiksha',
    'samta','sana','sangeeta','sangeetha','sanjana','sanya','sapna','sarada',
    'sarah','saraswathi','sarika','sarita','saritha','sarla','saroja','sathya',
    'savita','savitha','seema','sejal','shailaja','shaina','shalini','shama',
    'shanta','shanthi','sharda','sharmila','sheetal','shefali','shilpa','shilpi',
    'shital','shivangi','shivani','shobha','shobhna','shraddha','shreya','shrishti',
    'shruti','shubhangi','shubhi','shweta','siddhi','simar','simran','sindhu',
    'smita','sneha','snigdha','sonakshi','sonal','sonali','sonam','sonia',
    'sonu','sowmya','sridevi','sristi','subha','sudha','suguna','suhani',
    'sujata','sujatha','sulekha','sumathi','sumati','sunanda','sunita','sunitha',
    'supriya','surbhi','sushila','sushma','suvarna','svara','swarna','swati',
    'swetha','tanisha','taniya','tanuja','tanushree','tanvi','tanya','tara',
    'tasneem','tejal','tejaswini','thara','tina','tripti','trisha','trishala',
    'trupti','twinkle','uma','umadevi','unisha','urja','urmila','urshila',
    'urvashi','urvi','usha','vaani','vaidehi','vaijayanti','vaishali','vaishnavi',
    'valarmathi','valli','vandana','vandita','vani','vanshika','varalakshmi','varda',
    'varsha','vasantha','vasudha','veena','vibha','vidhi','vidisha','vidya',
    'vijayalakshmi','vineeta','vinita','vrinda','yachna','yamini','yashika','yashvi',
    'yesha','yogita','yuvika','zainab','zara','zeenat','zoya'
  ]::text[])
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE payments
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) = ANY (ARRAY[
    'aarti','aditi','aisha','akanksha','akansha','alisha','alka','alpa',
    'ami','amisha','amita','amrita','anagha','anisha','anita','anitha',
    'anjali','anusha','anushka','aparna','apeksha','apoorva','archana','arti',
    'asha','avni','ayesha','bansi','bela','bhairavi','bhavana','bhavani',
    'bhavna','bhumika','bina','bindi','binita','chandni','charmi','charu',
    'chhaya','chitra','daksha','damini','darshana','deepa','deepika','devika',
    'dimple','dipika','disha','diti','divya','drashti','drishti','ekta',
    'falguni','fatima','foram','gargi','garima','gauri','gayathri','gayatri',
    'geeta','geetha','gunjan','hansa','harini','haritha','harleen','harsha',
    'harshita','heena','hemal','hemali','hemangi','hetal','hetvi','hina',
    'ila','indira','indu','ishani','ishita','jagruti','janani','janki',
    'janvi','jaya','jayanthi','jhanvi','jigisha','jinal','juhi','jyoti',
    'kajal','kajol','kalpana','kalyani','kamala','kamini','kanchan','kanika',
    'karishma','karuna','kausalya','kavita','kavitha','kavya','keerthana','keerthi',
    'keerti','khushbu','khushi','khyati','kimaya','kiran','komal','krisha',
    'krishna','kriti','kritika','krupa','kruti','kshama','kusum','lakshmi',
    'lakshmipriya','lalitha','lata','latha','lavanya','leena','lina','madhavi',
    'madhuri','maitri','mala','malathi','malini','malti','mamta','manisha',
    'manju','mansi','maya','meena','meenakshi','meera','megha','meghana',
    'mehak','milan','mili','minal','mital','mitali','mona','moni',
    'monika','mouli','mouly','mrunal','mrunali','nagalakshmi','naina','naisha',
    'nalini','namrata','nandini','nandita','naomi','nayana','nayantara','nazia',
    'neelam','neelima','neerja','neeta','neha','nehal','nidhi','nikita',
    'nikki','nimisha','niral','nirmala','nisha','nishtha','nita','nithya',
    'niti','nupur','padma','padmavathi','palak','pallavi','pankti','pari',
    'parineeta','parisha','parul','parvathi','payal','pinky','pooja','poonam',
    'poorna','poornima','pragya','prakriti','pramila','prapti','pratiksha','pratima',
    'preeti','prema','prisha','priti','priya','priyal','priyanka','purnima',
    'purvi','rachana','rachita','rachna','radha','ragini','rajni','rajvi',
    'rakhi','ramya','rani','rashi','rashmi','rasika','raveena','reema',
    'reet','reeva','rekha','renu','renuka','reshma','revathi','richa',
    'riddhi','rima','rina','ritu','riya','rohini','roja','roopa',
    'roshan','roshni','ruchi','ruchika','ruhi','rupa','rupal','rupali',
    'rutuja','sadhana','sadhna','sagarika','sakshi','saloni','sameera','samiksha',
    'samta','sana','sangeeta','sangeetha','sanjana','sanya','sapna','sarada',
    'sarah','saraswathi','sarika','sarita','saritha','sarla','saroja','sathya',
    'savita','savitha','seema','sejal','shailaja','shaina','shalini','shama',
    'shanta','shanthi','sharda','sharmila','sheetal','shefali','shilpa','shilpi',
    'shital','shivangi','shivani','shobha','shobhna','shraddha','shreya','shrishti',
    'shruti','shubhangi','shubhi','shweta','siddhi','simar','simran','sindhu',
    'smita','sneha','snigdha','sonakshi','sonal','sonali','sonam','sonia',
    'sonu','sowmya','sridevi','sristi','subha','sudha','suguna','suhani',
    'sujata','sujatha','sulekha','sumathi','sumati','sunanda','sunita','sunitha',
    'supriya','surbhi','sushila','sushma','suvarna','svara','swarna','swati',
    'swetha','tanisha','taniya','tanuja','tanushree','tanvi','tanya','tara',
    'tasneem','tejal','tejaswini','thara','tina','tripti','trisha','trishala',
    'trupti','twinkle','uma','umadevi','unisha','urja','urmila','urshila',
    'urvashi','urvi','usha','vaani','vaidehi','vaijayanti','vaishali','vaishnavi',
    'valarmathi','valli','vandana','vandita','vani','vanshika','varalakshmi','varda',
    'varsha','vasantha','vasudha','veena','vibha','vidhi','vidisha','vidya',
    'vijayalakshmi','vineeta','vinita','vrinda','yachna','yamini','yashika','yashvi',
    'yesha','yogita','yuvika','zainab','zara','zeenat','zoya'
  ]::text[])
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';


-- ================================================================
-- PART 3 — final check: rows still at 'Mr.' whose first name ISN'T
-- in the dictionary above (and isn't an embedded title token either).
-- Could be a correctly-male name, an unlisted female name, a
-- company, or a single/ambiguous entry. Fix any of these by hand via
-- the admin Lead / Quote / Booking edit forms (Title dropdown).
-- ================================================================
SELECT 'bookings' AS table_name, id, tracking_id, customer_name, title FROM bookings WHERE title = 'Mr.'
UNION ALL
SELECT 'leads', id, lead_number, name, title FROM leads WHERE title = 'Mr.'
UNION ALL
SELECT 'quotes', id, quote_number, customer_name, title FROM quotes WHERE title = 'Mr.'
ORDER BY 1, 3;
