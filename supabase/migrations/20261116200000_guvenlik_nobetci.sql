-- Güvenlik nöbetçisi: şüpheli hareketleri kaydeder, saatlik özetle sahibine e-posta uyarısı gönderilir.
-- Kaydedilenler: yapay zekâ sınırı aşımları (ai_take reddi). Ayrıca saatlik yeni hesap sayısı izlenir.
-- E-posta: guvenlik-nobetci fonksiyonu (gizli ayarlar: RESEND_API_KEY, UYARI_EPOSTA). En çok saatte bir e-posta.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.guvenlik_olaylari (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  tur text not null,
  kim text,
  detay text
);
create index if not exists guvenlik_olaylari_at on public.guvenlik_olaylari (at);
alter table public.guvenlik_olaylari enable row level security;
revoke all on public.guvenlik_olaylari from anon, authenticated;

create table if not exists public.guvenlik_bildirim (
  id int primary key default 1 check (id = 1),
  son_gonderim timestamptz
);
insert into public.guvenlik_bildirim (id) values (1) on conflict do nothing;
alter table public.guvenlik_bildirim enable row level security;
revoke all on public.guvenlik_bildirim from anon, authenticated;

-- ai_take: davranış aynı; yalnız reddedilen istekler olay olarak kaydedilir
create or replace function public.ai_take(p_who text, p_limit integer, p_global integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare mine integer; total integer; pre text := split_part(p_who, ':', 1) || ':%';
begin
  perform pg_advisory_xact_lock(hashtext('ai_take:' || pre || current_date::text));
  select coalesce(sum(n), 0) into total from public.ai_usage where day = current_date and who like pre;
  if total >= p_global then
    insert into public.guvenlik_olaylari (tur, kim, detay) values ('ai_toplam_sinir', left(p_who, 80), 'günlük toplam sınır ' || p_global);
    return false;
  end if;
  insert into public.ai_usage (day, who, n) values (current_date, left(p_who, 80), 1)
  on conflict (day, who) do update set n = public.ai_usage.n + 1
  returning n into mine;
  if mine > p_limit then
    update public.ai_usage set n = n - 1 where day = current_date and who = left(p_who, 80);
    insert into public.guvenlik_olaylari (tur, kim, detay) values ('ai_kisi_sinir', left(p_who, 80), 'kişi sınırı ' || p_limit);
    return false;
  end if;
  return true;
end $$;
revoke execute on function public.ai_take(text, integer, integer) from public, anon, authenticated;

-- Saatlik özet. Eşik aşıldıysa (ya da p_test) ve son e-postadan 55 dk geçtiyse gonder=true döner.
create or replace function public.guvenlik_rapor(p_test boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  olaylar jsonb; olay_say integer; yeni_hesap integer; son timestamptz; esik boolean;
begin
  delete from public.guvenlik_olaylari where at < now() - interval '30 days';
  select coalesce(jsonb_object_agg(tur, c), '{}'::jsonb), coalesce(sum(c), 0)::int into olaylar, olay_say
    from (select tur, count(*) c from public.guvenlik_olaylari where at > now() - interval '1 hour' group by tur) s;
  select count(*)::int into yeni_hesap from auth.users where created_at > now() - interval '1 hour';
  esik := olay_say >= 10 or yeni_hesap >= 20;
  select son_gonderim into son from public.guvenlik_bildirim where id = 1 for update;
  if (esik or p_test) and (son is null or son < now() - interval '55 minutes') then
    update public.guvenlik_bildirim set son_gonderim = now() where id = 1;
    return jsonb_build_object('gonder', true, 'test', p_test and not esik, 'olaylar', olaylar, 'olay_say', olay_say, 'yeni_hesap', yeni_hesap);
  end if;
  return jsonb_build_object('gonder', false, 'olay_say', olay_say, 'yeni_hesap', yeni_hesap);
end $$;
revoke execute on function public.guvenlik_rapor(boolean) from public, anon, authenticated;
grant execute on function public.guvenlik_rapor(boolean) to service_role;

-- Her saat başı nöbetçiyi çalıştır
select cron.unschedule(jobid) from cron.job where jobname = 'guvenlik-nobetci';
select cron.schedule('guvenlik-nobetci', '7 * * * *', $$
  select net.http_post(
    url := 'https://anqfdlahimxdjovecsyk.supabase.co/functions/v1/guvenlik-nobetci',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
$$);
