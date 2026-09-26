-- Price Tracker schema (run in Supabase SQL editor)
create table if not exists tracked_products (
  id uuid primary key default gen_random_uuid(),
  store_product_id text not null,
  product_name text not null,
  brand text,
  category text,
  sku text,
  product_url text not null,
  selected_option_id text not null,
  selected_option_label text,
  created_at timestamptz not null default now(),
  unique (store_product_id, selected_option_id)
);

-- One row per scrape ATTEMPT (success, retried, failed). Price/stock null on failure.
create table if not exists scrape_attempts (
  id uuid primary key default gen_random_uuid(),
  tracked_product_id uuid not null references tracked_products(id) on delete cascade,
  store_product_id text not null,
  product_name text not null,
  selected_option text not null,
  scraped_at timestamptz not null default now(),
  price numeric,
  stock integer,
  outcome text not null check (outcome in ('success','retried','failed')),
  attempt integer not null default 1,
  message text,
  raw_excerpt text
);
create index if not exists idx_scrape_tracked_time on scrape_attempts (tracked_product_id, scraped_at desc);
