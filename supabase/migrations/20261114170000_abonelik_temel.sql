-- Çizim Atölyesi abonelik altyapısı (Supabase projesi: CIZIM-ATOLYESI, anqfdlahimxdjovecsyk)
-- Bu dosya projeye uygulanmış migration'ın kopyasıdır.

-- Kullanıcı profili: deneme süresi sunucuda belirlenir, kullanıcı değiştiremez
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '14 days')
);

-- Google Play abonelikleri (yalnız sunucu fonksiyonu yazar)
create table public.subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_token text not null unique,
  product_id text not null,
  plan text not null check (plan in ('tek','atolye','isletme')),
  sections text[] not null,
  state text not null,
  expires_at timestamptz,
  auto_renewing boolean not null default false,
  order_id text,
  superseded boolean not null default false,
  source text not null default 'play',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions(user_id);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;

create policy "kendi profilini okur" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "kendi aboneligini okur" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

-- Yeni kullanıcıda profil oluştur
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Uygulamanın tek çağrıda erişim durumunu okuması
create function public.my_access() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'now', now(),
    'trial_ends_at', (select p.trial_ends_at from public.profiles p where p.id = (select auth.uid())),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', s.product_id, 'plan', s.plan, 'sections', s.sections,
        'state', s.state, 'expires_at', s.expires_at, 'auto_renewing', s.auto_renewing))
      from public.subscriptions s
      where s.user_id = (select auth.uid()) and not s.superseded
        and s.expires_at > now()
        and s.state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED')
    ), '[]'::jsonb)
  )
$$;
revoke execute on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;
