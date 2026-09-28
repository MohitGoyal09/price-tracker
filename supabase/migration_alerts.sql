-- Price-drop alerts (bonus deliverable). Run in Supabase SQL editor.
create table if not exists price_alerts (
  id uuid primary key default gen_random_uuid(),
  tracked_product_id uuid not null references tracked_products(id) on delete cascade,
  store_product_id text not null,
  product_name text not null,
  selected_option text not null,
  old_price numeric not null,
  new_price numeric not null,
  drop_pct numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_alerts_time on price_alerts (created_at desc);
