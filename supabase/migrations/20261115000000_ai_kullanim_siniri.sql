-- Yapay zekâ ile model fotoğrafı okuma: günlük kullanım sınırı (yalnız sunucu fonksiyonu kullanır)
-- Bu dosya CIZIM-ATOLYESI projesine uygulanmış migration'ın kopyasıdır.
create table public.ai_usage (
  day date not null default current_date,
  who text not null,
  n integer not null default 0,
  primary key (day, who)
);
alter table public.ai_usage enable row level security;
-- politika yok: anon / authenticated erişemez, yalnız service role

-- Bir hak al: kişi (IP ya da kullanıcı) ve tüm sistem için günlük sınır. true = izin var
create function public.ai_take(p_who text, p_limit integer, p_global integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare mine integer; total integer;
begin
  select coalesce(sum(n), 0) into total from public.ai_usage where day = current_date;
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
