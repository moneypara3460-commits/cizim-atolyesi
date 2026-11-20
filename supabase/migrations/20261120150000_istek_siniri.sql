-- 20 Kasım 2026 — güvenlik sertleştirmesi: yapay zekâ dışındaki pahalı sunucu işlemleri için kullanıcı başına günlük sınır.
-- İlk kullanım: play-verify (her istek Google Play API'ye gider; sınırsız çağrı Google kotasını tüketebilirdi).
-- Sayaç ai_usage tablosunda "<tür>:<kullanıcı>" anahtarıyla tutulur (yapay zekâ türleriyle çakışmaz: farklı önek).
-- Reddedilen istekler güvenlik nöbetçisine olay olarak yazılır.
create or replace function public.istek_al(p_tur text, p_uid uuid, p_limit integer, p_global integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_who text; mine integer; total integer;
begin
  if p_tur !~ '^[a-z]{1,12}$' or p_uid is null then return false; end if;
  v_who := p_tur || ':' || p_uid::text;
  -- aynı türdeki istekler sıraya girer (toplam sınır yarışsız sayılır)
  perform pg_advisory_xact_lock(hashtext('istek_al:' || p_tur || ':' || current_date::text));
  select coalesce(sum(n), 0) into total from public.ai_usage where day = current_date and who like p_tur || ':%';
  if total >= p_global then
    insert into public.guvenlik_olaylari (tur, kim, detay) values ('istek_toplam_sinir', left(v_who, 80), p_tur || ' günlük toplam ' || p_global);
    return false;
  end if;
  insert into public.ai_usage (day, who, n) values (current_date, left(v_who, 80), 1)
  on conflict (day, who) do update set n = public.ai_usage.n + 1
  returning n into mine;
  if mine > p_limit then
    update public.ai_usage set n = n - 1 where day = current_date and who = left(v_who, 80);
    insert into public.guvenlik_olaylari (tur, kim, detay) values ('istek_kisi_sinir', left(v_who, 80), p_tur || ' kişi sınırı ' || p_limit);
    return false;
  end if;
  return true;
end $$;
revoke execute on function public.istek_al(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.istek_al(text, uuid, integer, integer) to service_role;
