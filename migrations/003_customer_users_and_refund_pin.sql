-- Migration 003: Customer accounts (with profile icon) and refund token PIN linkage
-- Run this in Supabase SQL Editor to mirror Neon Postgres schema.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_username TEXT;
CREATE INDEX IF NOT EXISTS orders_customer_user_idx ON orders (customer_username);

ALTER TABLE refund_tokens ADD COLUMN IF NOT EXISTS order_pin TEXT;
CREATE INDEX IF NOT EXISTS refund_tokens_phone_pin_idx ON refund_tokens (customer_phone, order_pin);

CREATE TABLE IF NOT EXISTS customer_users (
  id               SERIAL PRIMARY KEY,
  username         TEXT UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  full_name        TEXT NOT NULL,
  phone            TEXT NOT NULL,
  avatar_icon      TEXT DEFAULT 'pizza',
  default_location TEXT,
  default_address  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  last_login_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS customer_users_username_idx ON customer_users (username);

ALTER TABLE public.customer_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_tokens ENABLE ROW LEVEL SECURITY;
