-- Yapay zekâ günlük sınırı: (1) eşzamanlı istekler sınırı aşamasın diye işlem kilidi,
-- (2) her özelliğin (model okuma, parça çıkarma) toplam sınırı kendi sayacıyla (önek: "model:", "parca:").
-- Bu dosya CIZIM-ATOLYESI projesine uygulanmış migration'ın kopyasıdır.
create or replace function public.ai_take(p_who text, p_limit integer, p_global integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare mine integer; total integer; pre text := split_part(p_who, ':', 1) || ':%';
begin
  -- aynı özelliğe gelen istekleri gün içinde sıraya koy (işlem bitince kilit kendiliğinden kalkar)
  perform pg_advisory_xact_lock(hashtext('ai_take:' || pre || current_date::text));
  select coalesce(sum(n), 0) into total from public.ai_usage where day = current_date and who like pre;
  if total >= p_global then return false; end if;
  insert into public.ai_usage (day, who, n) values (current_date, left(p_who, 80), 1)
  on conflict (day, who) do update set n = public.ai_usage.n + 1
  returning n into mine;
  if mine > p_limit then
    update public.ai_usage set n = n - 1 where day = current_date and who = left(p_who, 80);
    return false;
  end if;
  return true;
end $$;
revoke execute on function public.ai_take(text, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_take(text, integer, integer) to service_role;
