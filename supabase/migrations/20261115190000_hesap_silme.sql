-- Hesap silme: silinen hesabın e-postasının yalnız özeti (SHA-256) tutulur ki aynı Google hesabıyla yeniden
-- girişte ücretsiz deneme tekrar başlamasın. E-postanın kendisi saklanmaz. (Gizlilik politikasında yazar.)
-- Bu dosya CIZIM-ATOLYESI projesine uygulanmış migration'ın kopyasıdır.
create table if not exists public.deneme_kullanildi (
  email_hash text primary key,
  at timestamptz not null default now()
);
alter table public.deneme_kullanildi enable row level security;   -- politika yok: yalnız sunucu (service_role) erişir

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h text := encode(sha256(convert_to(lower(coalesce(new.email, '')), 'UTF8')), 'hex');
begin
  insert into public.profiles (id, email, trial_ends_at)
  values (new.id, new.email,
          case when exists (select 1 from public.deneme_kullanildi d where d.email_hash = h) then now() else now() + interval '14 days' end)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
