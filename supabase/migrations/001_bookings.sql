-- ─────────────────────────────────────────────────────────────
-- BAGDROP — Supabase Migration 001
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ─────────────────────────────────────────────────────────────

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────

create type booking_status as enum (
  'pending',       -- inquiry received, awaiting confirmation call
  'confirmed',     -- team confirmed, awaiting pickup
  'picked_up',     -- bags collected from customer
  'in_transit',    -- bags moving to destination
  'delivered',     -- bags delivered successfully
  'cancelled'      -- cancelled by customer or ops
);

create type service_type as enum (
  'airport-to-door',
  'door-to-airport',
  'intercity',
  'destination-wedding',
  'student-relocation',
  'corporate'
);

-- ── Bookings table ────────────────────────────────────────────

create table bookings (
  id                uuid primary key default gen_random_uuid(),
  tracking_id       text unique not null,          -- BD-XXXXXX
  status            booking_status not null default 'pending',

  -- Customer
  customer_name     text not null,
  customer_email    text not null,
  customer_phone    text not null,

  -- Service
  service_type      text not null,
  service_label     text not null,

  -- Route
  from_city         text not null,
  to_city           text not null,
  pickup_address    text,
  drop_address      text,

  -- Schedule
  pickup_date       date,
  time_slot         text,
  flight_number     text,

  -- Bags
  total_bags        int not null default 1,
  bag_details       jsonb,                          -- [{type, weight, count}]

  -- Pricing
  total_amount      numeric(10, 2) not null default 0,
  currency          text not null default 'INR',
  add_ons           jsonb,                          -- [{id, label, price}]

  -- Internal
  notes             text,
  status_history    jsonb default '[]',            -- [{status, timestamp, note}]

  -- Timestamps
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Auto-update updated_at ─────────────────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger bookings_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- ── Indexes ──────────────────────────────────────────────────

create index idx_bookings_tracking_id  on bookings (tracking_id);
create index idx_bookings_status       on bookings (status);
create index idx_bookings_customer_email on bookings (customer_email);
create index idx_bookings_created_at   on bookings (created_at desc);
create index idx_bookings_pickup_date  on bookings (pickup_date);

-- ── Row Level Security ────────────────────────────────────────
-- Public: cannot read bookings (admin only via service_role key)
-- Customers can look up their own booking by tracking_id via API

alter table bookings enable row level security;

-- No public access — all reads/writes go through service_role key in API routes
-- (service_role bypasses RLS automatically)

-- ─────────────────────────────────────────────────────────────
-- DONE. Paste this entire file into Supabase SQL Editor and run.
-- ─────────────────────────────────────────────────────────────
