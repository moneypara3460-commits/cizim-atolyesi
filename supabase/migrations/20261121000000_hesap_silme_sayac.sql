-- 21 Kasım 2026 — güvenlik denetimi (docs: Çizim Atölyesi Güvenlik Denetimi) M1 ve L6 düzeltmesi.
-- Bu dosya CIZIM-ATOLYESI projesine uygulanan migration'ın kopyasıdır.
--
-- M1: Hesap silinince yapay zekâ kullanım sayaçları siliniyordu. Ortak günlük sınır bu sayaçların toplamıyla
--     hesaplandığı için "kullan → hesabı sil → aynı Google hesabıyla tekrar gir" döngüsü ortak sınırı etkisiz kılıyordu.
--     Artık sayaçlar silinmez, kullanıcı kimliği olmayan "<tür>:_silinen" satırına aktarılır: toplam aynı kalır,
--     silinen kullanıcının kimliği kalmaz.
--     Ayrıca daha önce silinmiş bir e-postayla yeniden açılan hesabın ilk 24 saatteki yapay zekâ hakkı 0'dır
--     (yeni hesap hakkı silme döngüsüyle yeniden kazanılamaz). 24 saatten sonra her ücretsiz kullanıcı gibi.
-- L6: "playdog:" (play-verify) sayacı da silmede kapsanır (hepsi aynı yolla aktarılır); güvenlik olaylarındaki
--     kullanıcı kimliği de "_silinen" ile değiştirilir.
-- Nöbetçi: her hesap silme bir olay olarak yazılır (saatte 10 olay eşiğine girer: silme seli fark edilir).

create or replace function public.hesap_sayac_devret(p_uid uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_on text; adet integer := 0;
begin
  if p_uid is null then return 0; end if;
  for r in select day, who, n from public.ai_usage where who like '%:' || p_uid::text order by day, who for update loop
    v_on := split_part(r.who, ':', 1);
    if v_on !~ '^[a-z]{1,13}$' then continue; end if;
    insert into public.ai_usage (day, who, n) values (r.day, v_on || ':_silinen', r.n)
      on conflict (day, who) do update set n = public.ai_usage.n + excluded.n;
    delete from public.ai_usage where day = r.day and who = r.who;
    adet := adet + 1;
  end loop;
  update public.guvenlik_olaylari set kim = split_part(kim, ':', 1) || ':_silinen' where kim like '%:' || p_uid::text;
  insert into public.guvenlik_olaylari (tur, kim, detay) values ('hesap_silme', null, 'hesap silindi');
  return adet;
end $$;
revoke execute on function public.hesap_sayac_devret(uuid) from public, anon, authenticated;
grant execute on function public.hesap_sayac_devret(uuid) to service_role;

-- ai_take_user: tek değişiklik, silinmiş e-postayla yeniden açılan hesabın ilk 24 saatte hakkı 0
create or replace function public.ai_take_user(
  p_uid uuid, p_kind text, p_paid_limit integer, p_trial_limit integer, p_new_limit integer, p_global integer
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  paid boolean; age interval; geri boolean; lim integer; v_who text; mine integer; total integer;
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
    select now() - u.created_at,
           exists (select 1 from public.deneme_kullanildi d
                   where d.email_hash = encode(sha256(convert_to(lower(coalesce(u.email, '')), 'UTF8')), 'hex'))
      into age, geri
      from auth.users u where u.id = p_uid;
    if age is null then return false; end if;
    lim := case when age < interval '24 hours' then (case when geri then 0 else p_new_limit end) else p_trial_limit end;
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
