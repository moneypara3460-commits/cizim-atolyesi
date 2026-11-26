// Çalıştır: node tests/vt-hesap-silme.test.mjs
// Veritabanı testi: supabase/migrations dosyalarının hepsi geçici, yerel bir PostgreSQL'e sırayla uygulanır
// (Supabase'in auth / cron / net şemaları küçük taklitlerle). Sonra hesap silme sayaç aktarımı (güvenlik denetimi M1, L6)
// ve yapay zekâ sınırı senaryoları ile davetli e-posta girişi kuralı sınanır. Canlı veritabanına dokunmaz.
// PostgreSQL kurulu değilse test atlanır (GitHub'ın ubuntu-latest makinesinde kuruludur).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binDir = (() => {
  const base = '/usr/lib/postgresql';
  if (!fs.existsSync(base)) return null;
  const v = fs.readdirSync(base).filter((x) => fs.existsSync(path.join(base, x, 'bin', 'initdb'))).sort((a, b) => b - a)[0];
  return v ? path.join(base, v, 'bin') : null;
})();
if (!binDir || !fs.existsSync('/usr/bin/psql')) { console.log('atlandı: PostgreSQL kurulu değil'); process.exit(0); }

const root = process.getuid && process.getuid() === 0;   // initdb kök kullanıcıyla çalışmaz
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cizim-vt-'));
fs.chmodSync(dir, 0o777);
const port = String(54000 + Math.floor(Math.random() * 900));
const as = (cmd, args) => (root ? spawnSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { encoding: 'utf8' }) : spawnSync(cmd, args, { encoding: 'utf8' }));
const must = (r, ne) => { if (r.status !== 0) { console.log('FAIL  ' + ne + '\n' + (r.stderr || r.stdout)); process.exit(1); } return r.stdout; };
must(as(path.join(binDir, 'initdb'), ['-D', path.join(dir, 'data'), '-U', 'postgres', '-A', 'trust']), 'initdb');
must(as(path.join(binDir, 'pg_ctl'), ['-D', path.join(dir, 'data'), '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, '-l', path.join(dir, 'log'), '-w', 'start']), 'pg_ctl start');
const stop = () => { as(path.join(binDir, 'pg_ctl'), ['-D', path.join(dir, 'data'), '-m', 'immediate', 'stop']); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* yok say */ } };
process.on('exit', stop);

const psql = (sql, db = 'postgres') => spawnSync('psql', ['-h', dir, '-p', port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-tA', '-c', sql], { encoding: 'utf8' });
const q = (sql) => { const r = psql(sql, 't'); if (r.status !== 0) throw new Error(r.stderr.trim()); return r.stdout.trim(); };

// Supabase taklitleri + bütün migration'lar sırayla
must(psql('create database t'), 'create database');
must(psql(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema cron; create schema net;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_app_meta_data jsonb not null default '{}', created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql as 'select null::uuid';
  create table cron.job (jobid bigint, jobname text);
  create function cron.schedule(a text, b text, c text) returns bigint language sql as 'select 1::bigint';
  create function cron.unschedule(a bigint) returns boolean language sql as 'select true';
  create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language sql as 'select 1::bigint';`, 't'), 'taklitler');
for (const f of fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((x) => x.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8').replace(/^\s*create extension[^;]*;/gim, '');
  const r = spawnSync('psql', ['-h', dir, '-p', port, '-U', 'postgres', '-d', 't', '-v', 'ON_ERROR_STOP=1', '-q'], { input: sql, encoding: 'utf8' });
  if (r.status !== 0) { console.log('FAIL  migration ' + f + '\n' + r.stderr); process.exit(1); }
}

let n = 0;
const t = (ad, f) => {
  try { f(); n++; console.log('ok    ' + ad); }
  catch (e) { console.log('FAIL  ' + ad + '\n      ' + e.message); process.exitCode = 1; }
};
const esit = (a, b, ne) => { if (String(a) !== String(b)) throw new Error(ne + ': ' + a + ' ≠ ' + b); };
const kul = (email, yas = '0') => q(`insert into auth.users (email, created_at) values ('${email}', now() - interval '${yas}') returning id`);
const sayac = (who) => q(`select coalesce(sum(n), 0) from public.ai_usage where day = current_date and who = '${who}'`);
const take = (uid) => q(`select public.ai_take_user('${uid}', 'model', 50, 10, 3, 300)`);

const A = kul('a@ornek.com'), B = kul('b@ornek.com');
q(`insert into public.ai_usage (day, who, n) values
   (current_date, 'model:${A}', 3), (current_date, 'modelp:${A}', 1), (current_date, 'playdog:${A}', 5),
   (current_date - 1, 'foto:${A}', 2), (current_date, 'model:${B}', 2)`);
q(`insert into public.guvenlik_olaylari (tur, kim, detay) values ('ai_kisi_sinir', 'model:${A}', 'x'), ('ai_kisi_sinir', 'model:${B}', 'y')`);

t('hesap silme: sayaçlar silinmez, kimliksiz satıra aktarılır; ortak toplam değişmez', () => {
  const once = q(`select sum(n) from public.ai_usage where day = current_date and who like 'model:%'`);
  esit(q(`select public.hesap_sayac_devret('${A}')`), 4, 'aktarılan satır');
  esit(q(`select count(*) from public.ai_usage where who like '%${A}'`), 0, 'kimlikli satır kalmamalı');
  esit(sayac('model:_silinen'), 3, 'model');
  esit(sayac('modelp:_silinen'), 1, 'modelp (abone sayacı)');
  esit(sayac('playdog:_silinen'), 5, 'playdog (L6)');
  esit(q(`select n from public.ai_usage where day = current_date - 1 and who = 'foto:_silinen'`), 2, 'dünkü sayaç kendi gününde');
  esit(sayac(`model:${B}`), 2, 'başka kullanıcıya dokunulmaz');
  esit(q(`select sum(n) from public.ai_usage where day = current_date and who like 'model:%'`), once, 'ortak toplam');
});
t('hesap silme: güvenlik olaylarında kimlik kalmaz, silme olay olarak yazılır', () => {
  esit(q(`select count(*) from public.guvenlik_olaylari where kim like '%${A}'`), 0, 'kimlik');
  esit(q(`select count(*) from public.guvenlik_olaylari where kim = 'model:_silinen'`), 1, 'kimliksiz olay');
  esit(q(`select count(*) from public.guvenlik_olaylari where kim = 'model:${B}'`), 1, 'başkasının olayı aynen');
  esit(q(`select count(*) from public.guvenlik_olaylari where tur = 'hesap_silme' and kim is null`), 1, 'silme olayı');
});
t('ikinci silme aynı kimliksiz satıra eklenir; boş kimlik hiçbir şey yapmaz', () => {
  const C = kul('c@ornek.com');
  q(`insert into public.ai_usage (day, who, n) values (current_date, 'model:${C}', 2)`);
  esit(q(`select public.hesap_sayac_devret('${C}')`), 1, 'aktarılan');
  esit(sayac('model:_silinen'), 5, 'birikir');
  esit(q(`select public.hesap_sayac_devret(null)`), 0, 'null');
});
t('silinmiş e-postayla yeniden açılan hesap ilk 24 saatte yapay zekâ kullanamaz (büyük/küçük harf fark etmez)', () => {
  q(`insert into public.deneme_kullanildi (email_hash) values (encode(sha256(convert_to('a@ornek.com', 'UTF8')), 'hex'))`);
  q(`delete from auth.users where id = '${A}'`);
  const A2 = kul('A@Ornek.com');
  esit(take(A2), 'f', 'geri gelen hesap');
  esit(q(`select count(*) from public.guvenlik_olaylari where kim = 'model:${A2}' and detay = 'kişi sınırı 0'`), 1, 'olay');
  esit(sayac(`model:${A2}`), 0, 'reddedilen istek sayılmaz');
});
t('yeni (hiç silinmemiş) hesap ilk 24 saatte 3 hak alır; 24 saatten eski geri gelen hesap deneme hakkını alır', () => {
  const D = kul('d@ornek.com');
  esit([take(D), take(D), take(D), take(D)].join(','), 't,t,t,f', 'yeni hesap');
  q(`insert into public.deneme_kullanildi (email_hash) values (encode(sha256(convert_to('e@ornek.com', 'UTF8')), 'hex'))`);
  const E = kul('e@ornek.com', '2 days');
  esit(take(E), 't', 'eski geri gelen hesap');
});
t('ortak günlük sınır kimliksiz satırı da sayar: silme döngüsü sınırı aşamaz', () => {
  q(`update public.ai_usage set n = 300 where day = current_date and who = 'model:_silinen'`);
  esit(take(kul('f@ornek.com')), 'f', 'ortak sınır dolu');
  esit(q(`select count(*) from public.guvenlik_olaylari where tur = 'ai_toplam_sinir'`), 1, 'olay');
});
t('yetkiler: yalnız sunucu rolü çağırabilir; SECURITY DEFINER ve boş search_path', () => {
  for (const [rol, beklenen] of [['anon', 'f'], ['authenticated', 'f'], ['service_role', 't']]) {
    esit(q(`select has_function_privilege('${rol}', 'public.hesap_sayac_devret(uuid)', 'execute')`), beklenen, rol + ' hesap_sayac_devret');
    esit(q(`select has_function_privilege('${rol}', 'public.ai_take_user(uuid,text,integer,integer,integer,integer)', 'execute')`), beklenen, rol + ' ai_take_user');
  }
  esit(q(`select prosecdef::text || ' ' || array_to_string(proconfig, ',') from pg_proc where proname = 'hesap_sayac_devret'`), 'true search_path=""', 'tanım');
});

// Davetli e-posta girişi (20261126180000): e-posta ile yeni hesap yalnız inceleme adresine açılır; Google kaydı etkilenmez
const yeni = (email, provider) => psql(`insert into auth.users (email, raw_app_meta_data) values ('${email}', '{"provider":"${provider}","providers":["${provider}"]}')`, 't');
t('e-posta ile kayıt: yabancı adres reddedilir (büyük harfle de)', () => {
  for (const e of ['saldirgan@ornek.com', 'CIZIMATOLYESI.INCELEME@GMAIL.COM', 'cizimatolyesi.inceleme+baska@gmail.com']) {
    const r = yeni(e, 'email');
    if (r.status === 0 || !/kayıt kapalı/.test(r.stderr)) throw new Error(e + ' kabul edildi');
  }
  esit(q(`select count(*) from auth.users where raw_app_meta_data->>'provider' = 'email'`), 0, 'eklenen e-posta hesabı');
});
t('e-posta ile kayıt: yalnız davetli inceleme adresi; Google kaydı serbest', () => {
  if (yeni('CizimAtolyesi.Inceleme+Play@gmail.com', 'email').status !== 0) throw new Error('davetli adres reddedildi');
  if (yeni('herhangi@gmail.com', 'google').status !== 0) throw new Error('Google kaydı reddedildi');
  esit(q(`select count(*) from public.profiles p join auth.users u on u.id = p.id where u.email in ('CizimAtolyesi.Inceleme+Play@gmail.com', 'herhangi@gmail.com')`), 2, 'profil (deneme) açıldı');
});

if (!process.exitCode) console.log('Hepsi geçti (' + n + ')');
