// Ayakkabı projeleri deposu: tarayıcıda IndexedDB ("cizim-ayk"), testlerde bellek.
// Makine (localStorage) ve tekstil (IndexedDB "cizim-tx") projelerinden ayrıdır; birbirini okumaz, yazmaz.
// put: otomatik kayıt (revizyon açmaz) · commit: revizyon (tam kopya, son MAX_REVS)
import { migrate, makeMaterial, DEFAULT_MATERIALS } from './model.js?v=20261114s';

export const MAX_REVS = 30;
export function memoryBackend() {
  const m = new Map();
  return { async get(k) { return m.has(k) ? JSON.parse(m.get(k)) : undefined; }, async set(k, v) { m.set(k, JSON.stringify(v)); }, async del(k) { m.delete(k); }, async keys() { return [...m.keys()]; } };
}
export function idbBackend(name = 'cizim-ayk') {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  let dbp = null;
  const tx = async (mode, fn) => { const db = await (dbp || (dbp = open())); return new Promise((res, rej) => { const t = db.transaction('kv', mode), s = t.objectStore('kv'); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Kayıt iptal edildi')); }); };
  return { get: (k) => tx('readonly', (s) => s.get(k)), set: (k, v) => tx('readwrite', (s) => s.put(v, k)), del: (k) => tx('readwrite', (s) => s.delete(k)), keys: () => tx('readonly', (s) => s.getAllKeys()) };
}
export function openStore(be) {
  const P = (id) => 'p:' + id, R = (id) => 'r:' + id;
  return {
    async list() {
      const out = [];
      for (const k of await be.keys()) if (String(k).startsWith('p:')) { const p = await be.get(k); if (p) out.push({ id: p.id, name: p.name, code: p.code, size: p.size, shoeType: p.shoeType, pieces: (p.pieces || []).length, rev: p.rev, modified: p.modified }); }
      return out.sort((a, b) => b.modified - a.modified);
    },
    async get(id) { const p = await be.get(P(id)); return p ? migrate(p) : null; },
    async put(p, { now = Date.now() } = {}) { p.modified = now; await be.set(P(p.id), JSON.parse(JSON.stringify(p))); return p; },
    async commit(p, note = '', { now = Date.now() } = {}) {
      p.rev = (p.rev || 0) + 1; p.modified = now;
      p.revisions = [...(p.revisions || []), { rev: p.rev, at: now, note: String(note || '').slice(0, 200) }].slice(-MAX_REVS);
      const revs = (await be.get(R(p.id))) || [];
      revs.push({ rev: p.rev, at: now, data: JSON.parse(JSON.stringify(p)) });
      await be.set(R(p.id), revs.slice(-MAX_REVS));
      await be.set(P(p.id), JSON.parse(JSON.stringify(p)));
      return p;
    },
    async revisions(id) { return ((await be.get(R(id))) || []).map((r) => ({ rev: r.rev, at: r.at, note: r.data.revisions?.at(-1)?.note || '' })).reverse(); },
    async restore(id, rev, { now = Date.now() } = {}) {
      const r = ((await be.get(R(id))) || []).find((x) => x.rev === rev);
      if (!r) throw new Error('Revizyon bulunamadı: ' + rev);
      const cur = await be.get(P(id));
      const p = migrate(r.data); p.rev = cur ? cur.rev : p.rev; p.revisions = cur ? cur.revisions : p.revisions;
      return this.commit(p, 'Rev ' + rev + ' geri yüklendi', { now });
    },
    async remove(id) { await be.del(P(id)); await be.del(R(id)); },
    exportJSON(p) { return JSON.stringify(p, null, 1); },
    async importJSON(text, { now = Date.now() } = {}) {
      const p = migrate(text);
      p.id = 'ay' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
      p.name = (p.name + ' (içe aktarıldı)').slice(0, 80); p.rev = 0; p.revisions = [];
      return this.commit(p, 'Dosyadan içe aktarıldı', { now });
    },
    // malzeme kütüphanesi (bütün projelerde ortak). Hazır malzemeler silinemez, düzenlenebilir.
    async materials() {
      const saved = (await be.get('lib:materials')) || [];
      const byId = new Map(saved.map((m) => [m.id, makeMaterial(m)]));
      const out = DEFAULT_MATERIALS.map((m) => byId.get(m.id) ? { ...byId.get(m.id), builtin: true } : makeMaterial({ ...m, builtin: true }));
      for (const m of byId.values()) if (!DEFAULT_MATERIALS.some((d) => d.id === m.id)) out.push(m);
      return out;
    },
    async saveMaterials(list) { await be.set('lib:materials', list.map(makeMaterial)); },
  };
}
