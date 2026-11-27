-- 27 Kasım 2026 — Promosyon kodu: testçilere / tanıdıklara ücretsiz süreli erişim.
-- Bu dosya CIZIM-ATOLYESI projesine uygulanan migration'ın kopyasıdır.
--
-- Güvenlik kuralları:
--  * Kodun kendisi veritabanında tutulmaz, yalnız SHA-256 özeti tutulur (tablo sızsa bile kod elde edilemez).
--  * Kodlar 16 rastgele karakterdir (32 harfli alfabe, 80 bit): tahminle bulunamaz.
--  * Kod tablolarını kimse okuyamaz/yazamaz (RLS açık, politika yok). Kullanıcı yalnız promosyon_kullan()'ı çağırır.
--  * Kod üretme ve iptal fonksiyonları uygulamaya açık DEĞİL; yalnız Supabase panelinden (SQL) çalışır.
--  * Kişi başına günde 5 deneme (istek_al); fazlası ve her hatalı kod güvenlik nöbetçisine olay olarak yazılır.
--  * Bir kod bir e-postada yalnız bir kez kullanılır; e-postanın özeti saklandığı için hesabı silip yeniden açmak işe yaramaz.
--  * Aktif promosyon varken ikinci kod kullanılamaz (üst üste süre biriktirilemez).
--  * Kullanım sayısı satır kilidiyle sayılır: aynı anda çok istekle kullanım sınırı aşılamaz.
--  * Erişim subscriptions tablosuna source='promo' satırı olarak yazılır; my_access() ve sunucu sınırları değişmeden çalışır.

create table public.promosyon_kodlari (
  id bigint generated always as identity primary key,
  kod_ozet text not null unique check (kod_ozet ~ '^[0-9a-f]{64}$'),
  etiket text,                                   -- kime/ne için verildiği (ör. "testçiler kasım")
  bolumler text[] not null check (bolumler <@ array['makine','tekstil','ayakkabi'] and cardinality(bolumler) > 0),
  gun integer not null check (gun between 1 and 365),
  en_cok integer not null default 1 check (en_cok between 1 and 1000),
  kullanilan integer not null default 0,
  son_tarih timestamptz not null,               -- bu tarihten sonra kod kabul edilmez
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.promosyon_kullanimlari (
  id bigint generated always as identity primary key,
  kod_id bigint not null references public.promosyon_kodlari(id),
  user_id uuid references auth.users(id) on delete set null,
  email_ozet text not null,
  created_at timestamptz not null default now(),
  unique (kod_id, email_ozet)
);

alter table public.promosyon_kodlari enable row level security;
alter table public.promosyon_kullanimlari enable row level security;
revoke all on public.promosyon_kodlari, public.promosyon_kullanimlari from anon, authenticated;

create or replace function public.promosyon_normal(p text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- Uygulamanın çağırdığı tek fonksiyon
create or replace function public.promosyon_kullan(p_kod text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text; v_eozet text; v_norm text; k public.promosyon_kodlari; v_kid bigint; v_bitis timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'hata', 'Giriş gerekli.'); end if;
  if not public.istek_al('promo', v_uid, 5, 1000) then
    return jsonb_build_object('ok', false, 'hata', 'Bugün çok fazla deneme yapıldı. Yarın tekrar dene.');
  end if;

  v_norm := public.promosyon_normal(p_kod);
  if length(v_norm) < 10 or length(v_norm) > 40 then
    return jsonb_build_object('ok', false, 'hata', 'Kod geçersiz.');
  end if;

  select * into k from public.promosyon_kodlari
   where kod_ozet = encode(extensions.digest(convert_to(v_norm, 'UTF8'), 'sha256'), 'hex')
   for update;
  if not found or not k.aktif or k.son_tarih <= now() or k.kullanilan >= k.en_cok then
    insert into public.guvenlik_olaylari (tur, kim, detay) values ('promo_hatali', 'promo:' || v_uid::text, 'geçersiz/bitmiş kod');
    return jsonb_build_object('ok', false, 'hata', 'Kod geçersiz ya da süresi dolmuş.');
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  v_eozet := encode(extensions.digest(convert_to(lower(coalesce(v_email, '')), 'UTF8'), 'sha256'), 'hex');

  if exists (select 1 from public.promosyon_kullanimlari where kod_id = k.id and email_ozet = v_eozet) then
    return jsonb_build_object('ok', false, 'hata', 'Bu kodu zaten kullandın.');
  end if;
  if exists (select 1 from public.subscriptions s where s.user_id = v_uid and s.source = 'promo' and s.expires_at > now()) then
    return jsonb_build_object('ok', false, 'hata', 'Zaten aktif bir promosyonun var.');
  end if;

  insert into public.promosyon_kullanimlari (kod_id, user_id, email_ozet) values (k.id, v_uid, v_eozet)
    returning id into v_kid;
  update public.promosyon_kodlari set kullanilan = kullanilan + 1 where id = k.id;

  v_bitis := now() + make_interval(days => k.gun);
  insert into public.subscriptions (user_id, purchase_token, product_id, plan, sections, state, expires_at, auto_renewing, source)
  values (v_uid, 'promo:' || v_kid, 'promo',
          case when cardinality(k.bolumler) = 3 then 'atolye' else 'tek' end,
          k.bolumler, 'SUBSCRIPTION_STATE_ACTIVE', v_bitis, false, 'promo');

  return jsonb_build_object('ok', true, 'bitis', v_bitis, 'bolumler', k.bolumler, 'gun', k.gun);
end $$;
revoke execute on function public.promosyon_kullan(text) from public, anon;
grant execute on function public.promosyon_kullan(text) to authenticated;

-- YALNIZ PANELDEN: kod üretir, düz kodu YALNIZ BU SEFER döndürür (sonra hiçbir yerden okunamaz).
-- Örnek: select * from public.promosyon_uret(10, 30, array['makine','tekstil','ayakkabi'], 1, now() + interval '60 days', 'testçiler');
create or replace function public.promosyon_uret(
  p_adet integer, p_gun integer, p_bolumler text[], p_en_cok integer, p_son_tarih timestamptz, p_etiket text
) returns table (kod text)
language plpgsql security definer set search_path = '' as $$
declare
  alfabe constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea; s text; i integer; j integer;
begin
  if p_adet not between 1 and 200 then raise exception 'adet 1-200 olmalı'; end if;
  for i in 1..p_adet loop
    b := extensions.gen_random_bytes(16);
    s := '';
    for j in 0..15 loop s := s || substr(alfabe, (get_byte(b, j) % 32) + 1, 1); end loop;   -- 256 % 32 = 0: eşit dağılım
    s := 'CZ-' || substr(s, 1, 4) || '-' || substr(s, 5, 4) || '-' || substr(s, 9, 4) || '-' || substr(s, 13, 4);
    insert into public.promosyon_kodlari (kod_ozet, etiket, bolumler, gun, en_cok, son_tarih)
    values (encode(extensions.digest(convert_to(public.promosyon_normal(s), 'UTF8'), 'sha256'), 'hex'),
            p_etiket, p_bolumler, p_gun, p_en_cok, p_son_tarih);
    kod := s; return next;
  end loop;
end $$;
revoke execute on function public.promosyon_uret(integer, integer, text[], integer, timestamptz, text) from public, anon, authenticated;

-- YALNIZ PANELDEN: kodu kapatır; p_erisimi_bitir true ise o kodla açılan erişimleri de hemen bitirir.
create or replace function public.promosyon_iptal(p_kod_id bigint, p_erisimi_bitir boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer := 0;
begin
  update public.promosyon_kodlari set aktif = false where id = p_kod_id;
  if p_erisimi_bitir then
    update public.subscriptions s set expires_at = now(), updated_at = now()
      from public.promosyon_kullanimlari k
     where k.kod_id = p_kod_id and s.purchase_token = 'promo:' || k.id and s.expires_at > now();
    get diagnostics n = row_count;
  end if;
  return n;
end $$;
revoke execute on function public.promosyon_iptal(bigint, boolean) from public, anon, authenticated;
revoke execute on function public.promosyon_normal(text) from public, anon;
