-- 18 Kasım 2026 — güvenlik incelemesinin iki düzeltmesi. Bu dosya CIZIM-ATOLYESI projesine uygulanmış migration'ın kopyasıdır.
--
-- 1) Gereksiz tablo izinleri: Supabase varsayılanı anon/authenticated rollerine bütün tablolarda yazma/silme izni verir.
--    Bugün RLS bunları engelliyor; ileride yanlış bir politika eklenirse kapı açılmasın diye izinler en aza indirilir.
--    Uygulama yalnız my_access() (profiles + subscriptions OKUR) çağırır; yazmalar sunucu fonksiyonlarındadır (service_role).
revoke all on table public.profiles, public.subscriptions, public.ai_usage, public.deneme_kullanildi from anon, authenticated;
grant select on table public.profiles, public.subscriptions to authenticated;

-- 2) Ortak yapay zekâ sınırını sahte hesaplarla tüketme saldırısına karşı:
--    - abonelerin kullanımı ortak (deneme) sınırına sayılmaz ve ondan etkilenmez (ayrı önek: "<tür>p:")
--    - abone olmayanlar: hesap 24 saatten yeniyse günlük hak çok düşük, değilse deneme hakkı
--    - ortak sınır yalnız abone olmayanlara uygulanır; dolarsa yalnız onlar bekler, müşteriler etkilenmez
create or replace function public.ai_take_user(
  p_uid uuid, p_kind text, p_paid_limit integer, p_trial_limit integer, p_new_limit integer, p_global integer
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  paid boolean; age interval; lim integer; v_who text; mine integer; total integer;
begin
  if p_kind !~ '^[a-z]{1,12}$' then return false; end if;
  paid := exists (
    select 1 from public.subscriptions s
    where s.user_id = p_uid and not s.superseded and s.expires_at > now()
      and s.state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'));
  if paid then
    v_who := p_kind || 'p:' || p_uid::text;
    lim := p_paid_limit;
  else
    v_who := p_kind || ':' || p_uid::text;
    select now() - u.created_at into age from auth.users u where u.id = p_uid;
    if age is null then return false; end if;
    lim := case when age < interval '24 hours' then p_new_limit else p_trial_limit end;
    -- ortak sınır (yalnız abone olmayanlar), aynı türdeki istekler sıraya girer
    perform pg_advisory_xact_lock(hashtext('ai_take:' || p_kind || ':' || current_date::text));
    select coalesce(sum(n), 0) into total from public.ai_usage where day = current_date and who like p_kind || ':%';
    if total >= p_global then
      insert into public.guvenlik_olaylari (tur, kim, detay) values ('ai_toplam_sinir', left(v_who, 80), 'günlük toplam sınır ' || p_global);
      return false;
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('ai_user:' || v_who || current_date::text));
  insert into public.ai_usage (day, who, n) values (current_date, left(v_who, 80), 1)
  on conflict (day, who) do update set n = public.ai_usage.n + 1
  returning n into mine;
  if mine > lim then
    update public.ai_usage set n = n - 1 where day = current_date and who = left(v_who, 80);
    insert into public.guvenlik_olaylari (tur, kim, detay) values ('ai_kisi_sinir', left(v_who, 80), 'kişi sınırı ' || lim);
    return false;
  end if;
  return true;
end $$;
revoke execute on function public.ai_take_user(uuid, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_take_user(uuid, text, integer, integer, integer, integer) to service_role;
