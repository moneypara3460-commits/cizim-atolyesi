// Tekstil projeleri deposu: tarayıcıda IndexedDB ("cizim-tx"), testlerde bellek.
// Makine projelerinden (localStorage) tamamen ayrıdır; biri diğerini okumaz, yazmaz.
// Her "revizyon kaydet" projenin tam kopyasını saklar (proje başına son MAX_REVS); otomatik kayıt revizyon açmaz.
import { migrate, isValid, validate } from './model.js?v=20261112k';

export const MAX_REVS = 30;

export function memoryBackend() {
  const m = new Map();
  return { async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : undefined; }, async set(k, v) { m.set(k, JSON.stringify(v)); }, async del(k) { m.delete(k); }, async keys() { return [...m.keys()]; } };
}
export function idbBackend(name = 'cizim-tx') {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  let dbp = null;
  const tx = async (mode, fn) => { const db = await (dbp || (dbp = open())); return new Promise((res, rej) => { const t = db.transaction('kv', mode), s = t.objectStore('kv'); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('İşlem iptal')); }); };
  return {
    get: (k) => tx('readonly', (s) => s.get(k)), set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
    del: (k) => tx('readwrite', (s) => s.delete(k)), keys: () => tx('readonly', (s) => s.getAllKeys()),
  };
}

export function openStore(be) {
  const P = (id) => 'p:' + id, R = (id) => 'r:' + id;
  return {
    async list() {
      const out = [];
      for (const k of await be.keys()) if (String(k).startsWith('p:')) { const p = await be.get(k); if (p) out.push({ id: p.id, name: p.name, type: p.type, rev: p.rev, modified: p.modified }); }
      return out.sort((a, b) => b.modified - a.modified);
    },
    async get(id) { const p = await be.get(P(id)); return p ? migrate(p) : null; },
    // Otomatik kayıt: revizyon numarası artmaz. Geçersiz proje de kaydedilir (iş kaybolmasın), doğrulama arayüzde gösterilir.
    async put(p, { now = Date.now() } = {}) { p.modified = now; await be.set(P(p.id), p); return p; },
    // Revizyon: numara artar, tam kopya saklanır. Hatalı proje revizyon olarak işaretlenir ama engellenmez.
    async commit(p, note = '', { now = Date.now() } = {}) {
      p.rev = (p.rev || 0) + 1; p.modified = now;
      const errs = validate(p).filter((x) => x.level === 'hata').length;
      p.revisions = [...(p.revisions || []), { rev: p.rev, at: now, note: String(note || '').slice(0, 200), errors: errs }].slice(-MAX_REVS);
      const revs = (await be.get(R(p.id))) || [];
      revs.push({ rev: p.rev, at: now, data: p });
      await be.set(R(p.id), revs.slice(-MAX_REVS));
      await be.set(P(p.id), p);
      return p;
    },
    async revisions(id) { return ((await be.get(R(id))) || []).map((r) => ({ rev: r.rev, at: r.at, note: r.data.revisions?.at(-1)?.note || '', valid: isValid(r.data) })); },
    // Eski revizyona dönüş, yeni bir revizyon olarak kaydedilir (geçmiş silinmez).
    async restore(id, rev, { now = Date.now() } = {}) {
      const r = ((await be.get(R(id))) || []).find((x) => x.rev === rev);
      if (!r) throw new Error('Revizyon bulunamadı: ' + rev);
      const cur = await be.get(P(id));
      const p = migrate(r.data); p.rev = cur ? cur.rev : p.rev; p.revisions = cur ? cur.revisions : p.revisions;
      return this.commit(p, 'Rev ' + rev + ' geri yüklendi', { now });
    },
    async remove(id) { await be.del(P(id)); await be.del(R(id)); },
    exportJSON(p) { return JSON.stringify(p, null, 1); },
    // İçe aktarma her zaman yeni kimlikle yapılır: var olan projenin üstüne yazmaz.
    async importJSON(text, { now = Date.now() } = {}) {
      const p = migrate(text);
      p.id = 'tx' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      p.name = p.name + ' (içe aktarıldı)';
      return this.commit(p, 'Dosyadan içe aktarıldı', { now });
    },
  };
}
