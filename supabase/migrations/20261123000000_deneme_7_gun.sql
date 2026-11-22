-- Ücretsiz deneme 14 günden 7 güne (23.11.2026 kararı). Yalnız bundan sonra açılan hesapları etkiler;
-- süresi devam eden denemeler değişmez. Silinip yeniden açılan hesaba deneme yine verilmez (deneme_kullanildi).
-- Bu dosya CIZIM-ATOLYESI projesine uygulanmış migration'ın kopyasıdır.
alter table public.profiles alter column trial_ends_at set default (now() + interval '7 days');

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare h text := encode(sha256(convert_to(lower(coalesce(new.email, '')), 'UTF8')), 'hex');
begin
  insert into public.profiles (id, email, trial_ends_at)
  values (new.id, new.email,
          case when exists (select 1 from public.deneme_kullanildi d where d.email_hash = h) then now() else now() + interval '7 days' end)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
