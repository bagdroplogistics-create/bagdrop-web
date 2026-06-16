-- ─────────────────────────────────────────────────────────
-- BAGDROP — Supabase Migration: 001_create_bookings
-- Run via: supabase db push
-- ─────────────────────────────────────────────────────────

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── bookings ──────────────────────────────────────────────
create table if not exists bookings (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Customer
  customer_name     text not null,
  customer_email    text not null,
  customer_phone    text not null,
  customer_notes    text,

  -- Service
  service_id        text not null,   -- 'airport-delivery' | 'door-to-door' | ...
  from_city         text not null,
  to_city           text not null,

  -- Schedule
  pickup_date       date not null,
  time_slot         text not null,   -- 'morning' | 'afternoon' | 'evening'
  pickup_address    text not null,
  drop_address      text not null,

  -- Flight (optional, airport-delivery only)
  flight_number     text,
  flight_datetime   timestamptz,

  -- Bags (stored as JSONB array: [{type, quantity}])
  bags              jsonb not null default '[]',
  addon_ids         text[] not null default '{}',

  -- Pricing (in ₹)
  bag_subtotal      numeric(10,2) not null default 0,
  multi_discount    numeric(10,2) not null default 0,
  route_fee         numeric(10,2) not null default 0,
  service_adjust    numeric(10,2) not null default 0,
  addons_total      numeric(10,2) not null default 0,
  subtotal          numeric(10,2) not null default 0,
  gst               numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,
  total_bags        int not null default 0,

  -- Payment
  razorpay_order_id   text unique,
  razorpay_payment_id text unique,
  razorpay_signature  text,
  payment_status      text not null default 'pending',  -- pending | paid | failed | refunded
  payment_verified    boolean not null default false,

  -- Operations
  status            text not null default 'booked',     -- booked | picked_up | in_transit | delivered | cancelled
  tracking_id       text unique,   -- BD-XXXXXX shown to customer
  assigned_agent    text,
  ops_notes         text
);

-- ── Indexes ───────────────────────────────────────────────
create index if not exists bookings_email_idx    on bookings(customer_email);
create index if not exists bookings_phone_idx    on bookings(customer_phone);
create index if not exists bookings_status_idx   on bookings(status);
create index if not exists bookings_payment_idx  on bookings(payment_status);
create index if not exists bookings_rzp_order_idx on bookings(razorpay_order_id);
create index if not exists bookings_date_idx     on bookings(pickup_date);

-- ── Auto-update updated_at ────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bookings_updated_at
  before update on bookings
  for each row execute procedure set_updated_at();

-- ── Row Level Security ────────────────────────────────────
alter table bookings enable row level security;

-- Service role (backend API) can do everything
create policy "service_role_all" on bookings
  for all using (auth.role() = 'service_role');

-- Authenticated users can read their own bookings
create policy "customer_read_own" on bookings
  for select using (
    auth.role() = 'authenticated' AND
    customer_email = auth.jwt() ->> 'email'
  );

comment on table bookings is 'Bagdrop customer bookings — one row per booking';
