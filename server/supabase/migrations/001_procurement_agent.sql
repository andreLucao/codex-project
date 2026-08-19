create table if not exists public.rfqs (
  id uuid primary key,
  request_id text not null unique,
  restaurant_id text not null,
  raw_request text not null,
  item text not null,
  supplier_type text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  delivery_deadline text not null,
  delivery_location text not null,
  notes text,
  status text not null check (status in ('collecting','negotiating','awaiting_approval','awaiting_confirmation','awarded','insufficient_quotes','failed')),
  min_quotes_to_negotiate integer not null,
  min_quotes_on_timeout integer not null,
  quote_timeout_at timestamptz not null,
  counteroffer_timeout_seconds integer not null,
  recommended_quote_id uuid,
  approved_quote_id uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.rfq_suppliers (
  id uuid primary key,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  external_supplier_id text not null,
  name text not null,
  phone text not null,
  rating numeric,
  status text not null,
  conversation_id text,
  provider_initial_message_id text,
  last_supplier_message_at timestamptz,
  service_window_expires_at timestamptz,
  clarification_count integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (rfq_id, external_supplier_id)
);

create table if not exists public.agent_messages (
  id uuid primary key,
  provider_message_id text unique,
  idempotency_key text unique,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  rfq_supplier_id uuid not null references public.rfq_suppliers(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  type text not null check (type in ('text','audio','image')),
  body text,
  media_id text,
  mime_type text,
  created_at timestamptz not null
);

create table if not exists public.quotes (
  id uuid primary key,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  rfq_supplier_id uuid not null references public.rfq_suppliers(id) on delete cascade,
  source_message_id uuid not null references public.agent_messages(id),
  round text not null check (round in ('initial','counteroffer')),
  price_amount numeric,
  price_quantity numeric,
  price_unit text,
  freight_amount numeric,
  freight_included boolean,
  delivery_deadline text,
  confidence numeric not null check (confidence between 0 and 1),
  evidence text not null,
  comparable boolean not null,
  delivered_unit_price numeric,
  delivered_total numeric,
  normalized_unit text not null,
  reason text,
  created_at timestamptz not null
);

create table if not exists public.negotiation_rounds (
  id uuid primary key,
  rfq_id uuid not null unique references public.rfqs(id) on delete cascade,
  anchor_quote_id uuid not null references public.quotes(id),
  anchor_unit_price numeric not null,
  normalized_unit text not null,
  target_supplier_ids uuid[] not null,
  responded_supplier_ids uuid[] not null default '{}',
  trigger text not null check (trigger in ('threshold','timeout')),
  status text not null check (status in ('open','closed')),
  closes_at timestamptz not null,
  created_at timestamptz not null,
  closed_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rfqs_recommended_quote_fk') then
    alter table public.rfqs add constraint rfqs_recommended_quote_fk foreign key (recommended_quote_id) references public.quotes(id) deferrable initially deferred;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rfqs_approved_quote_fk') then
    alter table public.rfqs add constraint rfqs_approved_quote_fk foreign key (approved_quote_id) references public.quotes(id) deferrable initially deferred;
  end if;
end $$;

create index if not exists rfqs_active_timeout_idx on public.rfqs (status, quote_timeout_at);
create index if not exists quotes_rfq_supplier_idx on public.quotes (rfq_id, rfq_supplier_id, created_at desc);
create index if not exists agent_messages_thread_idx on public.agent_messages (rfq_supplier_id, created_at);

alter table public.rfqs enable row level security;
alter table public.rfq_suppliers enable row level security;
alter table public.agent_messages enable row level security;
alter table public.quotes enable row level security;
alter table public.negotiation_rounds enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rfqs'
  ) then alter publication supabase_realtime add table public.rfqs; end if;
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quotes'
  ) then alter publication supabase_realtime add table public.quotes; end if;
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'negotiation_rounds'
  ) then alter publication supabase_realtime add table public.negotiation_rounds; end if;
end $$;

comment on table public.rfqs is 'Fonte de verdade das solicitações de cotação do agente.';
comment on column public.rfq_suppliers.service_window_expires_at is '24h após a última mensagem recebida do fornecedor; não é aberta pelo template inicial.';
