create extension if not exists pgcrypto;

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  responsible_name text not null check (char_length(trim(responsible_name)) > 0),
  address text not null check (char_length(trim(address)) > 0),
  whatsapp text not null check (whatsapp ~ '^\\+55[0-9]{10,11}$'),
  frequent_supplies text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.restaurants enable row level security;

comment on column public.restaurants.whatsapp is
  'Brazilian WhatsApp number in canonical +55DDDNÚMERO format.';
