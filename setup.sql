-- Cocoa Luxury store: run this once in Supabase > SQL Editor > New query > Run.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  category text not null default 'General',
  description text,
  price numeric(10,2) not null check (price >= 0),
  sizes text,
  stock integer check (stock is null or stock >= 0),
  images text[] not null default '{}',
  active boolean not null default true
);

create table if not exists public.orders (
  id uuid primary key,
  created_at timestamptz not null default now(),
  customer_name text not null,
  phone text not null,
  address text not null,
  items jsonb not null,
  total numeric(10,2) not null,
  payment_method text not null check (payment_method in ('whatsapp', 'razorpay')),
  payment_id text,
  status text not null default 'new'
);

alter table public.products enable row level security;
alter table public.orders enable row level security;

-- Shoppers can see visible products only. The signed-in admin can do everything.
drop policy if exists "Public can view visible products" on public.products;
create policy "Public can view visible products" on public.products
  for select to anon, authenticated using (active = true);

drop policy if exists "Admin manages products" on public.products;
create policy "Admin manages products" on public.products
  for all to authenticated using (true) with check (true);

-- Shoppers can place orders but cannot read them. Only the admin reads and updates orders.
drop policy if exists "Anyone can place an order" on public.orders;
create policy "Anyone can place an order" on public.orders
  for insert to anon, authenticated with check (status = 'new');

drop policy if exists "Admin manages orders" on public.orders;
create policy "Admin manages orders" on public.orders
  for all to authenticated using (true) with check (true);

-- Product photo storage: public to view, admin only to upload or remove.
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

drop policy if exists "Public can view product photos" on storage.objects;
create policy "Public can view product photos" on storage.objects
  for select to anon, authenticated using (bucket_id = 'products');

drop policy if exists "Admin uploads product photos" on storage.objects;
create policy "Admin uploads product photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'products');

drop policy if exists "Admin updates product photos" on storage.objects;
create policy "Admin updates product photos" on storage.objects
  for update to authenticated using (bucket_id = 'products');

drop policy if exists "Admin deletes product photos" on storage.objects;
create policy "Admin deletes product photos" on storage.objects
  for delete to authenticated using (bucket_id = 'products');
