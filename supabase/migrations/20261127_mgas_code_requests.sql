-- MGAS baggage-code request workflow (Mumbai T2 arrivals).
-- Live sending is OFF by default: settings.mgas_mode = 'off' (dry-run only).
-- Run in Supabase SQL editor. Safe to re-run.

create table if not exists mgas_batches (
  id uuid primary key default gen_random_uuid(),
  batch_key text not null unique,            -- idempotency: trigger:istDay:hash(bookingIds)
  trigger text not null,                     -- auto | manual | resend | retry
  mode text not null,                        -- off (dry-run) | test | live
  recipient text,
  message_text text,
  booking_count int not null default 0,
  status text not null default 'claimed',    -- claimed | sent | failed | dry_run | test_sent
  provider_request_id text,
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists mgas_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id) on delete cascade,  -- one request per booking = hard duplicate guard
  arrival_date date,
  scheduled_request_date date,               -- arrival_date - 2 calendar days (IST)
  request_status text not null default 'pending',
    -- pending | needs_review | late_review | sending | sent | failed | cancelled | excluded
  review_reason text,
  review_approved_by text,
  review_approved_at timestamptz,
  eligibility_note text,
  batch_id uuid references mgas_batches(id),
  sent_at timestamptz,
  send_attempts int not null default 0,
  last_error text,
  codes_status text not null default 'not_requested',
    -- not_requested | awaiting | received | verified | customer_notified
  codes text[] not null default '{}',
  codes_note text,
  codes_received_at timestamptz,
  codes_verified_by text,
  codes_verified_at timestamptz,
  customer_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mgas_requests_sched_idx on mgas_requests (request_status, scheduled_request_date);

create table if not exists mgas_audit (
  id bigserial primary key,
  request_id uuid,
  booking_id uuid,
  action text not null,
  actor text,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists mgas_audit_req_idx on mgas_audit (request_id, created_at desc);

alter table mgas_batches enable row level security;
alter table mgas_requests enable row level security;
alter table mgas_audit enable row level security;

-- Safe defaults: nothing is ever sent until the founder flips mgas_mode.
insert into settings (key, value) values
  ('mgas_mode', 'off'),
  ('mgas_recipient', '+919503250997'),
  ('mgas_test_number', ''),
  ('mgas_template_name', 'bagdrop_mgas_code_request')
on conflict (key) do nothing;
