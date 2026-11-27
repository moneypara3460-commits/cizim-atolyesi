-- 27 Kasım 2026 — denetim: promosyon kullanımlarında kullanıcı yabancı anahtarına dizin (hesap silmede tam tarama olmasın).
-- Bu dosya CIZIM-ATOLYESI projesine uygulanan migration'ın kopyasıdır.
create index if not exists promosyon_kullanimlari_user_idx on public.promosyon_kullanimlari(user_id);
