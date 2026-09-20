-- Cocoa Luxury store, upgrade v2.
-- Run AFTER setup.sql: Supabase > SQL Editor > New query > paste all > Run.
-- Safe to run more than once.

-- 1. New product and order columns
alter table public.products
  add column if not exists compare_at_price numeric(10,2) check (compare_at_price is null or compare_at_price >= 0);

alter table public.orders
  add column if not exists subtotal numeric(10,2),
  add column if not exists discount numeric(10,2) not null default 0,
  add column if not exists shipping numeric(10,2) not null default 0,
  add column if not exists coupon_code text,
  add column if not exists note text;

-- 2. Store settings (one row): delivery fee, announcement bar, policy text
create table if not exists public.store_settings (
  id integer primary key default 1 check (id = 1),
  shipping_fee numeric(10,2) not null default 0,
  free_shipping_above numeric(10,2),
  announcement text,
  shipping_info text,
  returns_info text,
  size_guide text
);

insert into public.store_settings (id, shipping_info, returns_info, size_guide)
values (
  1,
  'Orders are packed within 1 to 2 working days. Delivery usually takes 3 to 7 working days. We update you on WhatsApp.',
  'If your item arrives damaged or in the wrong size, message us on WhatsApp within 48 hours with photos and we will help.',
  'Not sure about your size? Message us on WhatsApp with your height and weight and we will suggest one.'
)
on conflict (id) do nothing;

alter table public.store_settings enable row level security;

drop policy if exists "Public can read settings" on public.store_settings;
create policy "Public can read settings" on public.store_settings
  for select to anon, authenticated using (true);

drop policy if exists "Admin manages settings" on public.store_settings;
create policy "Admin manages settings" on public.store_settings
  for all to authenticated using (true) with check (true);

-- 3. Discount codes
create table if not exists public.coupons (
  code text primary key check (code = upper(code)),
  kind text not null check (kind in ('percent', 'flat')),
  value numeric(10,2) not null check (value > 0),
  min_order numeric(10,2) not null default 0,
  expires_at date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.coupons enable row level security;

drop policy if exists "Admin manages coupons" on public.coupons;
create policy "Admin manages coupons" on public.coupons
  for all to authenticated using (true) with check (true);

-- 4. Shoppers can no longer write orders directly. They go through place_order below,
--    which reads prices from the database, so nobody can change a price in the browser.
drop policy if exists "Anyone can place an order" on public.orders;

create or replace function public.coupon_discount(p_code text, p_subtotal numeric)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  c public.coupons;
begin
  select * into c from public.coupons
   where code = upper(trim(p_code)) and active and (expires_at is null or expires_at >= current_date);
  if not found or p_subtotal < c.min_order then
    return 0;
  end if;
  if c.kind = 'percent' then
    return round(p_subtotal * least(c.value, 100) / 100, 2);
  end if;
  return least(c.value, p_subtotal);
end $$;

create or replace function public.check_coupon(p_code text, p_subtotal numeric)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c public.coupons;
begin
  select * into c from public.coupons
   where code = upper(trim(p_code)) and active and (expires_at is null or expires_at >= current_date);
  if not found then
    return jsonb_build_object('valid', false, 'message', 'This code is not valid or has expired.');
  end if;
  if p_subtotal < c.min_order then
    return jsonb_build_object('valid', false, 'message', 'This code needs an order of at least ' || c.min_order || '.');
  end if;
  return jsonb_build_object('valid', true, 'discount', public.coupon_discount(p_code, p_subtotal));
end $$;

create or replace function public.place_order(
  p_id uuid, p_name text, p_phone text, p_address text,
  p_items jsonb, p_coupon text, p_method text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  prod public.products;
  s public.store_settings;
  qty integer;
  sz text;
  line_items jsonb := '[]'::jsonb;
  subtotal numeric := 0;
  disc numeric := 0;
  ship numeric := 0;
  total numeric;
begin
  if p_method not in ('whatsapp', 'razorpay') then
    raise exception 'Choose a valid payment option.';
  end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' or coalesce(trim(p_address), '') = '' then
    raise exception 'Enter your name, phone number and address.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'Your bag is empty.';
  end if;

  for it in select value from jsonb_array_elements(p_items) loop
    qty := coalesce((it->>'qty')::integer, 0);
    if qty < 1 or qty > 20 then
      raise exception 'Invalid quantity.';
    end if;

    select * into prod from public.products where id = (it->>'id')::uuid and active for update;
    if not found then
      raise exception 'An item in your bag is no longer available.';
    end if;
    if prod.stock is not null and prod.stock < qty then
      raise exception '% has only % left.', prod.name, prod.stock;
    end if;

    sz := nullif(trim(it->>'size'), '');
    if coalesce(trim(prod.sizes), '') <> '' then
      if sz is null or not (sz = any (select trim(x) from unnest(string_to_array(prod.sizes, ',')) as x)) then
        raise exception 'Choose a size for %.', prod.name;
      end if;
    else
      sz := null;
    end if;

    if prod.stock is not null then
      update public.products set stock = stock - qty where id = prod.id;
    end if;

    subtotal := subtotal + prod.price * qty;
    line_items := line_items || jsonb_build_array(jsonb_build_object(
      'id', prod.id, 'name', prod.name, 'size', sz, 'qty', qty, 'price', prod.price
    ));
  end loop;

  select * into s from public.store_settings where id = 1;
  if coalesce(trim(p_coupon), '') <> '' then
    disc := public.coupon_discount(p_coupon, subtotal);
  end if;
  if s.free_shipping_above is not null and (subtotal - disc) >= s.free_shipping_above then
    ship := 0;
  else
    ship := coalesce(s.shipping_fee, 0);
  end if;
  total := subtotal - disc + ship;

  insert into public.orders (
    id, customer_name, phone, address, items, subtotal, discount, shipping,
    coupon_code, total, payment_method, status
  ) values (
    p_id, left(trim(p_name), 80), left(trim(p_phone), 20), left(trim(p_address), 400), line_items,
    subtotal, disc, ship, case when disc > 0 then upper(trim(p_coupon)) else null end,
    total, p_method, 'new'
  );

  return jsonb_build_object(
    'id', p_id, 'items', line_items, 'subtotal', subtotal,
    'discount', disc, 'shipping', ship, 'total', total
  );
end $$;

-- Records the Razorpay payment ID on an order that was just created.
create or replace function public.attach_payment(p_id uuid, p_payment_id text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.orders
     set payment_id = left(p_payment_id, 60)
   where id = p_id and payment_method = 'razorpay' and payment_id is null
     and created_at > now() - interval '3 hours';
end $$;

-- Lets a customer look up their own order with the order number and phone number.
create or replace function public.track_order(p_code text, p_phone text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o public.orders;
  digits text;
begin
  digits := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if length(digits) < 10 then
    return null;
  end if;
  select * into o from public.orders
   where upper(left(id::text, 6)) = upper(trim(replace(coalesce(p_code, ''), '#', '')))
     and right(regexp_replace(phone, '\D', '', 'g'), 10) = digits
   order by created_at desc limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'short', upper(left(o.id::text, 6)), 'status', o.status, 'created_at', o.created_at,
    'total', o.total, 'items', o.items, 'note', o.note
  );
end $$;

grant execute on function public.check_coupon(text, numeric) to anon, authenticated;
grant execute on function public.place_order(uuid, text, text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.attach_payment(uuid, text) to anon, authenticated;
grant execute on function public.track_order(text, text) to anon, authenticated;

-- 5. When you cancel an order, its items go back into stock.
create or replace function public.restore_stock_on_cancel()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for it in select value from jsonb_array_elements(old.items) loop
      update public.products
         set stock = stock + coalesce((it->>'qty')::integer, 0)
       where id = (it->>'id')::uuid and stock is not null;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists orders_restore_stock on public.orders;
create trigger orders_restore_stock
  after update of status on public.orders
  for each row execute function public.restore_stock_on_cancel();
