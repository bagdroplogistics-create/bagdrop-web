-- ================================================================
-- Bagdrop — Customer Title (Mr./Mrs./Ms.) — COMPLETE, ONE-SHOT SCRIPT
-- Run this ENTIRE file in the Supabase SQL Editor:
-- https://supabase.com/dashboard  →  your project  →  SQL Editor
-- ================================================================
--
-- Your database was missing the `title` column entirely — that's why
-- the backfill-only script failed with "column title does not
-- exist". A later attempt also failed with "relation
-- female_first_names does not exist" — Supabase's SQL editor runs
-- each statement as its own connection, so a CREATE TEMP TABLE (or a
-- WITH ... AS CTE) from one statement isn't visible to the next one.
--
-- This version has NO temp tables and NO cross-statement state —
-- every statement below is fully self-contained, using an inline
-- ARRAY[...] literal repeated in each one. It will work regardless
-- of how the SQL editor batches or pools statements.
--
--   PART 1 — adds the `title` column (+ CHECK constraint) to
--            bookings, leads, quotes, invoices, and payments.
--            Every existing row is auto-backfilled to 'Mr.' by the
--            column default (standard Postgres behavior).
--
--   PART 2 — corrects that default for existing records where the
--            name clearly indicates otherwise: flips 'Mr.' → 'Ms.'
--            for any row whose first name matches a curated list of
--            ~340 common Indian/international female first names,
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
-- Each statement below is fully self-contained (no temp table, no
-- CTE) — the same female-name array is inlined into every UPDATE.
-- ================================================================

UPDATE bookings
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) = ANY (ARRAY[
    'aarti','aditi','aisha','akanksha','akansha','alisha','alka','alpa',
    'ami','amisha','amita','amrita','anagha','anisha','anita','anjali',
    'anushka','aparna','apeksha','apoorva','archana','arti','asha','avni',
    'ayesha','bansi','bela','bhairavi','bhavana','bhavna','bhumika','bina',
    'bindi','binita','chandni','charmi','charu','chhaya','chitra','daksha',
    'damini','darshana','deepa','deepika','devika','dimple','dipika','disha',
    'diti','divya','drashti','drishti','ekta','falguni','fatima','foram',
    'gargi','garima','gauri','gayatri','geeta','gunjan','hansa','harleen',
    'harsha','harshita','heena','hemal','hemangi','hetal','hetvi','hina',
    'ila','indu','ishani','ishita','jagruti','janki','janvi','jaya',
    'jhanvi','jigisha','jinal','juhi','jyoti','kajal','kajol','kalpana',
    'kamini','kanchan','kanika','karishma','karuna','kavita','kavya','keerti',
    'khushbu','khushi','khyati','kimaya','kiran','komal','krisha','krishna',
    'kriti','kritika','krupa','kruti','kshama','kusum','lata','lavanya',
    'leena','lina','madhuri','maitri','mala','malti','mamta','manisha',
    'manju','mansi','maya','meena','meera','megha','mehak','milan',
    'mili','minal','mital','mitali','mona','monika','mrunal','mrunali',
    'naina','naisha','nalini','namrata','nandini','nandita','naomi','nayana',
    'nayantara','nazia','neelam','neelima','neerja','neeta','neha','nehal',
    'nidhi','nikita','nikki','nimisha','niral','nisha','nishtha','nita',
    'niti','nupur','padma','palak','pallavi','pankti','pari','parineeta',
    'parisha','parul','payal','pinky','pooja','poonam','poornima','pragya',
    'prakriti','prapti','pratiksha','pratima','preeti','prisha','priti','priya',
    'priyal','priyanka','purnima','purvi','rachana','rachita','rachna','radha',
    'ragini','rajni','rajvi','rakhi','rani','rashi','rashmi','rasika',
    'raveena','reema','reet','reeva','rekha','renu','renuka','reshma',
    'richa','riddhi','rima','rina','ritu','riya','rohini','roopa',
    'roshan','roshni','ruchi','ruchika','ruhi','rupa','rupali','rutuja',
    'sadhana','sadhna','sagarika','sakshi','saloni','sameera','samiksha','samta',
    'sana','sangeeta','sanjana','sanya','sapna','sarah','sarika','sarita',
    'sarla','savita','seema','sejal','shaina','shalini','shama','shanta',
    'sharda','sharmila','sheetal','shefali','shilpa','shilpi','shital','shivangi',
    'shivani','shobha','shobhna','shraddha','shreya','shrishti','shruti','shubhangi',
    'shubhi','shweta','siddhi','simar','simran','sindhu','smita','sneha',
    'snigdha','sonakshi','sonal','sonali','sonam','sonia','sonu','sristi',
    'sudha','suhani','sujata','sulekha','sunanda','sunita','supriya','surbhi',
    'sushila','sushma','svara','swati','tanisha','taniya','tanuja','tanushree',
    'tanvi','tanya','tara','tasneem','tejal','tejaswini','tina','tripti',
    'trisha','trishala','trupti','twinkle','uma','urja','urmila','urshila',
    'urvashi','urvi','usha','vaani','vaidehi','vaishali','vaishnavi','vandana',
    'vandita','vanshika','varda','varsha','vasudha','veena','vibha','vidhi',
    'vidisha','vidya','vineeta','vinita','vrinda','yachna','yamini','yashika',
    'yashvi','yesha','yogita','yuvika','zainab','zara','zeenat','zoya'
  ]::text[])
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE leads
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(name), ' ', 1)) = ANY (ARRAY[
    'aarti','aditi','aisha','akanksha','akansha','alisha','alka','alpa',
    'ami','amisha','amita','amrita','anagha','anisha','anita','anjali',
    'anushka','aparna','apeksha','apoorva','archana','arti','asha','avni',
    'ayesha','bansi','bela','bhairavi','bhavana','bhavna','bhumika','bina',
    'bindi','binita','chandni','charmi','charu','chhaya','chitra','daksha',
    'damini','darshana','deepa','deepika','devika','dimple','dipika','disha',
    'diti','divya','drashti','drishti','ekta','falguni','fatima','foram',
    'gargi','garima','gauri','gayatri','geeta','gunjan','hansa','harleen',
    'harsha','harshita','heena','hemal','hemangi','hetal','hetvi','hina',
    'ila','indu','ishani','ishita','jagruti','janki','janvi','jaya',
    'jhanvi','jigisha','jinal','juhi','jyoti','kajal','kajol','kalpana',
    'kamini','kanchan','kanika','karishma','karuna','kavita','kavya','keerti',
    'khushbu','khushi','khyati','kimaya','kiran','komal','krisha','krishna',
    'kriti','kritika','krupa','kruti','kshama','kusum','lata','lavanya',
    'leena','lina','madhuri','maitri','mala','malti','mamta','manisha',
    'manju','mansi','maya','meena','meera','megha','mehak','milan',
    'mili','minal','mital','mitali','mona','monika','mrunal','mrunali',
    'naina','naisha','nalini','namrata','nandini','nandita','naomi','nayana',
    'nayantara','nazia','neelam','neelima','neerja','neeta','neha','nehal',
    'nidhi','nikita','nikki','nimisha','niral','nisha','nishtha','nita',
    'niti','nupur','padma','palak','pallavi','pankti','pari','parineeta',
    'parisha','parul','payal','pinky','pooja','poonam','poornima','pragya',
    'prakriti','prapti','pratiksha','pratima','preeti','prisha','priti','priya',
    'priyal','priyanka','purnima','purvi','rachana','rachita','rachna','radha',
    'ragini','rajni','rajvi','rakhi','rani','rashi','rashmi','rasika',
    'raveena','reema','reet','reeva','rekha','renu','renuka','reshma',
    'richa','riddhi','rima','rina','ritu','riya','rohini','roopa',
    'roshan','roshni','ruchi','ruchika','ruhi','rupa','rupali','rutuja',
    'sadhana','sadhna','sagarika','sakshi','saloni','sameera','samiksha','samta',
    'sana','sangeeta','sanjana','sanya','sapna','sarah','sarika','sarita',
    'sarla','savita','seema','sejal','shaina','shalini','shama','shanta',
    'sharda','sharmila','sheetal','shefali','shilpa','shilpi','shital','shivangi',
    'shivani','shobha','shobhna','shraddha','shreya','shrishti','shruti','shubhangi',
    'shubhi','shweta','siddhi','simar','simran','sindhu','smita','sneha',
    'snigdha','sonakshi','sonal','sonali','sonam','sonia','sonu','sristi',
    'sudha','suhani','sujata','sulekha','sunanda','sunita','supriya','surbhi',
    'sushila','sushma','svara','swati','tanisha','taniya','tanuja','tanushree',
    'tanvi','tanya','tara','tasneem','tejal','tejaswini','tina','tripti',
    'trisha','trishala','trupti','twinkle','uma','urja','urmila','urshila',
    'urvashi','urvi','usha','vaani','vaidehi','vaishali','vaishnavi','vandana',
    'vandita','vanshika','varda','varsha','vasudha','veena','vibha','vidhi',
    'vidisha','vidya','vineeta','vinita','vrinda','yachna','yamini','yashika',
    'yashvi','yesha','yogita','yuvika','zainab','zara','zeenat','zoya'
  ]::text[])
  AND name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE quotes
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) = ANY (ARRAY[
    'aarti','aditi','aisha','akanksha','akansha','alisha','alka','alpa',
    'ami','amisha','amita','amrita','anagha','anisha','anita','anjali',
    'anushka','aparna','apeksha','apoorva','archana','arti','asha','avni',
    'ayesha','bansi','bela','bhairavi','bhavana','bhavna','bhumika','bina',
    'bindi','binita','chandni','charmi','charu','chhaya','chitra','daksha',
    'damini','darshana','deepa','deepika','devika','dimple','dipika','disha',
    'diti','divya','drashti','drishti','ekta','falguni','fatima','foram',
    'gargi','garima','gauri','gayatri','geeta','gunjan','hansa','harleen',
    'harsha','harshita','heena','hemal','hemangi','hetal','hetvi','hina',
    'ila','indu','ishani','ishita','jagruti','janki','janvi','jaya',
    'jhanvi','jigisha','jinal','juhi','jyoti','kajal','kajol','kalpana',
    'kamini','kanchan','kanika','karishma','karuna','kavita','kavya','keerti',
    'khushbu','khushi','khyati','kimaya','kiran','komal','krisha','krishna',
    'kriti','kritika','krupa','kruti','kshama','kusum','lata','lavanya',
    'leena','lina','madhuri','maitri','mala','malti','mamta','manisha',
    'manju','mansi','maya','meena','meera','megha','mehak','milan',
    'mili','minal','mital','mitali','mona','monika','mrunal','mrunali',
    'naina','naisha','nalini','namrata','nandini','nandita','naomi','nayana',
    'nayantara','nazia','neelam','neelima','neerja','neeta','neha','nehal',
    'nidhi','nikita','nikki','nimisha','niral','nisha','nishtha','nita',
    'niti','nupur','padma','palak','pallavi','pankti','pari','parineeta',
    'parisha','parul','payal','pinky','pooja','poonam','poornima','pragya',
    'prakriti','prapti','pratiksha','pratima','preeti','prisha','priti','priya',
    'priyal','priyanka','purnima','purvi','rachana','rachita','rachna','radha',
    'ragini','rajni','rajvi','rakhi','rani','rashi','rashmi','rasika',
    'raveena','reema','reet','reeva','rekha','renu','renuka','reshma',
    'richa','riddhi','rima','rina','ritu','riya','rohini','roopa',
    'roshan','roshni','ruchi','ruchika','ruhi','rupa','rupali','rutuja',
    'sadhana','sadhna','sagarika','sakshi','saloni','sameera','samiksha','samta',
    'sana','sangeeta','sanjana','sanya','sapna','sarah','sarika','sarita',
    'sarla','savita','seema','sejal','shaina','shalini','shama','shanta',
    'sharda','sharmila','sheetal','shefali','shilpa','shilpi','shital','shivangi',
    'shivani','shobha','shobhna','shraddha','shreya','shrishti','shruti','shubhangi',
    'shubhi','shweta','siddhi','simar','simran','sindhu','smita','sneha',
    'snigdha','sonakshi','sonal','sonali','sonam','sonia','sonu','sristi',
    'sudha','suhani','sujata','sulekha','sunanda','sunita','supriya','surbhi',
    'sushila','sushma','svara','swati','tanisha','taniya','tanuja','tanushree',
    'tanvi','tanya','tara','tasneem','tejal','tejaswini','tina','tripti',
    'trisha','trishala','trupti','twinkle','uma','urja','urmila','urshila',
    'urvashi','urvi','usha','vaani','vaidehi','vaishali','vaishnavi','vandana',
    'vandita','vanshika','varda','varsha','vasudha','veena','vibha','vidhi',
    'vidisha','vidya','vineeta','vinita','vrinda','yachna','yamini','yashika',
    'yashvi','yesha','yogita','yuvika','zainab','zara','zeenat','zoya'
  ]::text[])
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE invoices
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) = ANY (ARRAY[
    'aarti','aditi','aisha','akanksha','akansha','alisha','alka','alpa',
    'ami','amisha','amita','amrita','anagha','anisha','anita','anjali',
    'anushka','aparna','apeksha','apoorva','archana','arti','asha','avni',
    'ayesha','bansi','bela','bhairavi','bhavana','bhavna','bhumika','bina',
    'bindi','binita','chandni','charmi','charu','chhaya','chitra','daksha',
    'damini','darshana','deepa','deepika','devika','dimple','dipika','disha',
    'diti','divya','drashti','drishti','ekta','falguni','fatima','foram',
    'gargi','garima','gauri','gayatri','geeta','gunjan','hansa','harleen',
    'harsha','harshita','heena','hemal','hemangi','hetal','hetvi','hina',
    'ila','indu','ishani','ishita','jagruti','janki','janvi','jaya',
    'jhanvi','jigisha','jinal','juhi','jyoti','kajal','kajol','kalpana',
    'kamini','kanchan','kanika','karishma','karuna','kavita','kavya','keerti',
    'khushbu','khushi','khyati','kimaya','kiran','komal','krisha','krishna',
    'kriti','kritika','krupa','kruti','kshama','kusum','lata','lavanya',
    'leena','lina','madhuri','maitri','mala','malti','mamta','manisha',
    'manju','mansi','maya','meena','meera','megha','mehak','milan',
    'mili','minal','mital','mitali','mona','monika','mrunal','mrunali',
    'naina','naisha','nalini','namrata','nandini','nandita','naomi','nayana',
    'nayantara','nazia','neelam','neelima','neerja','neeta','neha','nehal',
    'nidhi','nikita','nikki','nimisha','niral','nisha','nishtha','nita',
    'niti','nupur','padma','palak','pallavi','pankti','pari','parineeta',
    'parisha','parul','payal','pinky','pooja','poonam','poornima','pragya',
    'prakriti','prapti','pratiksha','pratima','preeti','prisha','priti','priya',
    'priyal','priyanka','purnima','purvi','rachana','rachita','rachna','radha',
    'ragini','rajni','rajvi','rakhi','rani','rashi','rashmi','rasika',
    'raveena','reema','reet','reeva','rekha','renu','renuka','reshma',
    'richa','riddhi','rima','rina','ritu','riya','rohini','roopa',
    'roshan','roshni','ruchi','ruchika','ruhi','rupa','rupali','rutuja',
    'sadhana','sadhna','sagarika','sakshi','saloni','sameera','samiksha','samta',
    'sana','sangeeta','sanjana','sanya','sapna','sarah','sarika','sarita',
    'sarla','savita','seema','sejal','shaina','shalini','shama','shanta',
    'sharda','sharmila','sheetal','shefali','shilpa','shilpi','shital','shivangi',
    'shivani','shobha','shobhna','shraddha','shreya','shrishti','shruti','shubhangi',
    'shubhi','shweta','siddhi','simar','simran','sindhu','smita','sneha',
    'snigdha','sonakshi','sonal','sonali','sonam','sonia','sonu','sristi',
    'sudha','suhani','sujata','sulekha','sunanda','sunita','supriya','surbhi',
    'sushila','sushma','svara','swati','tanisha','taniya','tanuja','tanushree',
    'tanvi','tanya','tara','tasneem','tejal','tejaswini','tina','tripti',
    'trisha','trishala','trupti','twinkle','uma','urja','urmila','urshila',
    'urvashi','urvi','usha','vaani','vaidehi','vaishali','vaishnavi','vandana',
    'vandita','vanshika','varda','varsha','vasudha','veena','vibha','vidhi',
    'vidisha','vidya','vineeta','vinita','vrinda','yachna','yamini','yashika',
    'yashvi','yesha','yogita','yuvika','zainab','zara','zeenat','zoya'
  ]::text[])
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

UPDATE payments
SET title = 'Ms.'
WHERE title = 'Mr.'
  AND lower(split_part(trim(customer_name), ' ', 1)) = ANY (ARRAY[
    'aarti','aditi','aisha','akanksha','akansha','alisha','alka','alpa',
    'ami','amisha','amita','amrita','anagha','anisha','anita','anjali',
    'anushka','aparna','apeksha','apoorva','archana','arti','asha','avni',
    'ayesha','bansi','bela','bhairavi','bhavana','bhavna','bhumika','bina',
    'bindi','binita','chandni','charmi','charu','chhaya','chitra','daksha',
    'damini','darshana','deepa','deepika','devika','dimple','dipika','disha',
    'diti','divya','drashti','drishti','ekta','falguni','fatima','foram',
    'gargi','garima','gauri','gayatri','geeta','gunjan','hansa','harleen',
    'harsha','harshita','heena','hemal','hemangi','hetal','hetvi','hina',
    'ila','indu','ishani','ishita','jagruti','janki','janvi','jaya',
    'jhanvi','jigisha','jinal','juhi','jyoti','kajal','kajol','kalpana',
    'kamini','kanchan','kanika','karishma','karuna','kavita','kavya','keerti',
    'khushbu','khushi','khyati','kimaya','kiran','komal','krisha','krishna',
    'kriti','kritika','krupa','kruti','kshama','kusum','lata','lavanya',
    'leena','lina','madhuri','maitri','mala','malti','mamta','manisha',
    'manju','mansi','maya','meena','meera','megha','mehak','milan',
    'mili','minal','mital','mitali','mona','monika','mrunal','mrunali',
    'naina','naisha','nalini','namrata','nandini','nandita','naomi','nayana',
    'nayantara','nazia','neelam','neelima','neerja','neeta','neha','nehal',
    'nidhi','nikita','nikki','nimisha','niral','nisha','nishtha','nita',
    'niti','nupur','padma','palak','pallavi','pankti','pari','parineeta',
    'parisha','parul','payal','pinky','pooja','poonam','poornima','pragya',
    'prakriti','prapti','pratiksha','pratima','preeti','prisha','priti','priya',
    'priyal','priyanka','purnima','purvi','rachana','rachita','rachna','radha',
    'ragini','rajni','rajvi','rakhi','rani','rashi','rashmi','rasika',
    'raveena','reema','reet','reeva','rekha','renu','renuka','reshma',
    'richa','riddhi','rima','rina','ritu','riya','rohini','roopa',
    'roshan','roshni','ruchi','ruchika','ruhi','rupa','rupali','rutuja',
    'sadhana','sadhna','sagarika','sakshi','saloni','sameera','samiksha','samta',
    'sana','sangeeta','sanjana','sanya','sapna','sarah','sarika','sarita',
    'sarla','savita','seema','sejal','shaina','shalini','shama','shanta',
    'sharda','sharmila','sheetal','shefali','shilpa','shilpi','shital','shivangi',
    'shivani','shobha','shobhna','shraddha','shreya','shrishti','shruti','shubhangi',
    'shubhi','shweta','siddhi','simar','simran','sindhu','smita','sneha',
    'snigdha','sonakshi','sonal','sonali','sonam','sonia','sonu','sristi',
    'sudha','suhani','sujata','sulekha','sunanda','sunita','supriya','surbhi',
    'sushila','sushma','svara','swati','tanisha','taniya','tanuja','tanushree',
    'tanvi','tanya','tara','tasneem','tejal','tejaswini','tina','tripti',
    'trisha','trishala','trupti','twinkle','uma','urja','urmila','urshila',
    'urvashi','urvi','usha','vaani','vaidehi','vaishali','vaishnavi','vandana',
    'vandita','vanshika','varda','varsha','vasudha','veena','vibha','vidhi',
    'vidisha','vidya','vineeta','vinita','vrinda','yachna','yamini','yashika',
    'yashvi','yesha','yogita','yuvika','zainab','zara','zeenat','zoya'
  ]::text[])
  AND customer_name !~* '(PVT|PRIVATE|LTD|LIMITED|LLP|LLC|INC\.?|CORP|CORPORATION|ENTERPRISE|ENTERPRISES|INDUSTR(Y|IES)|COMPANY|CO\.|GROUP|TRADERS?|EXPORTS?|IMPORTS?|SOLUTIONS?|SERVICES?|LOGISTICS|ASSOCIATES|PARTNERS|FOODS?|HOMEMADE|HOSPITAL|SCHOOL|COLLEGE|TRUST|FOUNDATION|SOCIETY|BANK|HOTEL|RESORT|TRAVELS?|TOURS?|CARGO|FREIGHT|SHIPPING|BUILDERS?|CONSTRUCTIONS?|REALTY|PROPERTIES|CONSULTANC(Y|IES)|TECHNOLOG(Y|IES)|SYSTEMS?|STUDIO|WORKS|MART|STORES?)';

-- ================================================================
-- PART 3 — final check: rows still at 'Mr.' whose first name ISN'T
-- in the dictionary above. Could be a correctly-male name, an
-- unlisted female name, a company, or a single/ambiguous entry.
-- Fix any of these by hand via the admin Lead / Quote / Booking
-- edit forms (Title dropdown).
-- ================================================================
SELECT 'bookings' AS table_name, id, tracking_id, customer_name, title FROM bookings WHERE title = 'Mr.'
UNION ALL
SELECT 'leads', id, lead_number, name, title FROM leads WHERE title = 'Mr.'
UNION ALL
SELECT 'quotes', id, quote_number, customer_name, title FROM quotes WHERE title = 'Mr.'
ORDER BY 1, 3;
