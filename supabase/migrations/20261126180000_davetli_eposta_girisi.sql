-- Davetli e-posta + şifre girişi (Google Play inceleme hesabı). GEÇİCİ: kapalı test / inceleme bitince kaldırılacak.
-- Uygulamada giriş yalnız Google iledir; Supabase'de e-posta sağlayıcısı yalnız bu hesap için açılır.
-- Bu tetik, e-posta ile YENİ hesap açılmasını sunucuda reddeder: herkese açık kayıt yok, kota/şifre tahmini riski yok.
-- İzinli tek adres aşağıdadır; hesap Supabase panelinde (Authentication → Users → Add user, "Auto confirm") açılır.
create or replace function public.eposta_kaydi_yalniz_davetli()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data->>'provider', '') = 'email'
     and lower(coalesce(new.email, '')) <> 'cizimatolyesi.inceleme+play@gmail.com' then
    raise exception 'E-posta ile kayıt kapalı; giriş Google ile yapılır.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.eposta_kaydi_yalniz_davetli() from public, anon, authenticated;

drop trigger if exists eposta_kaydi_yalniz_davetli on auth.users;
create trigger eposta_kaydi_yalniz_davetli
  before insert on auth.users
  for each row execute function public.eposta_kaydi_yalniz_davetli();
