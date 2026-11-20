// Güvenlik nöbetçisi: saatlik zamanlayıcı (pg_cron) çağırır. Şüpheli hareket eşiği aşıldıysa sahibine e-posta gönderir.
// Gizli ayarlar: RESEND_API_KEY (zorunlu), UYARI_EPOSTA (alıcı), NOBETCI_ANAHTAR (deneme e-postası için; yoksa deneme kapalı).
// JWT doğrulaması kapalıdır (zamanlayıcı oturumsuz çağırır). Herkese açık çağrı yalnız gerçek eşik aşıldıysa gerçek raporu
// gönderebilir; uyarıyı bastıramaz. Deneme e-postası ("test") ise yalnız x-nobetci-anahtar başlığı doğruysa çalışır —
// yoksa biri deneme çağrısıyla saatlik sayacı sıfırlayıp gerçek uyarıyı geciktirebilir ve sahte e-posta yağdırabilirdi.
// İstek: POST {}  ya da  POST { "test": true } + başlık x-nobetci-anahtar: <NOBETCI_ANAHTAR>
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { esitMi, jsonOku } from '../_shared/istek.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const AD: Record<string, string> = {
  ai_kisi_sinir: 'Kişisel yapay zekâ sınırını aşma denemesi',
  ai_toplam_sinir: 'Günlük toplam yapay zekâ sınırına ulaşıldı',
  istek_kisi_sinir: 'Kişisel istek sınırını aşma denemesi (ör. satın alma doğrulama)',
  istek_toplam_sinir: 'Günlük toplam istek sınırına ulaşıldı (ör. satın alma doğrulama)',
};
const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST', { status: 405 });
  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('UYARI_EPOSTA');
  if (!key || !to) return new Response('ayar eksik', { status: 503 });

  const okunan = await jsonOku(req, 1024);
  let test = !!okunan.body && okunan.body.test === true;
  if (test) {
    const ana = Deno.env.get('NOBETCI_ANAHTAR') || '';
    if (!ana || !esitMi(req.headers.get('x-nobetci-anahtar') || '', ana)) return new Response('yetkisiz', { status: 403 });
  }

  const { data: r, error } = await admin.rpc('guvenlik_rapor', { p_test: test });
  if (error) { console.error(error); return new Response('hata', { status: 500 }); }
  if (!r?.gonder) return new Response('sakin');

  const satirlar = Object.entries((r.olaylar || {}) as Record<string, number>)
    .map(([t, n]) => `<li>${esc(AD[t] || t)}: <b>${n}</b></li>`).join('');
  const html = r.test
    ? '<p>Güvenlik nöbetçisi çalışıyor. Şüpheli bir hareket olursa bu adrese uyarı gelecek.</p>'
    : `<p>Son 1 saatte Çizim Atölyesi'nde olağandışı hareket görüldü. Saldırılar engellendi; bilgin olsun diye yazıyorum.</p>
       <ul>${satirlar}<li>Yeni açılan hesap: <b>${r.yeni_hesap}</b></li></ul>
       <p>Ayrıntı: Supabase → CIZIM-ATOLYESI → Table Editor → guvenlik_olaylari</p>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: 'Çizim Atölyesi Güvenlik <onboarding@resend.dev>',
      to: [to],
      subject: r.test ? '✅ Güvenlik nöbetçisi kuruldu' : `⚠️ Çizim Atölyesi: ${r.olay_say} şüpheli hareket`,
      html,
    }),
  });
  if (!res.ok) { console.error('resend', res.status, await res.text()); return new Response('gonderilemedi', { status: 502 }); }
  return new Response('gonderildi');
});
