// Ortak klavye köprüsü (kb/keys.js): tuş adları, kullanıcı tuş değişiklikleri
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyName, normKey, effectiveKey, isEditable } from '../kb/keys.js';

test('tuş adı: harf büyük, Ctrl / Cmd aynı, Shift yalnız Ctrl\'li ve özel tuşlarda', () => {
  assert.equal(keyName({ key: 'l' }), 'L');
  assert.equal(keyName({ key: 'ı' }), 'I');
  assert.equal(keyName({ key: 'i' }), 'I');
  assert.equal(keyName({ key: 'z', ctrlKey: true }), 'CTRL+Z');
  assert.equal(keyName({ key: 'z', metaKey: true }), 'CTRL+Z');
  assert.equal(keyName({ key: 'Z', ctrlKey: true, shiftKey: true }), 'CTRL+SHIFT+Z');
  assert.equal(keyName({ key: 'F', shiftKey: true }), 'F');
  assert.equal(keyName({ key: 'Enter', shiftKey: true }), 'SHIFT+ENTER');
  assert.equal(keyName({ key: '?', shiftKey: true }), '?');
  assert.equal(keyName({ key: ' ' }), 'SPACE');
  assert.equal(keyName({ key: 'Escape' }), 'ESCAPE');
  assert.equal(keyName({ key: 'p', ctrlKey: true, altKey: true }), 'CTRL+ALT+P');
});

test('tuş yazımı sıradan bağımsız; kullanıcı değişikliği ekran bazında uygulanır', () => {
  assert.equal(normKey('shift+ctrl+p'), 'CTRL+SHIFT+P');
  assert.equal(normKey('Ctrl + Z'), 'CTRL+Z');
  const ovr = { 'tx-kalip:C': 'Q', 'tx-cizim:CTRL+P': 'ctrl+shift+x' };
  assert.equal(effectiveKey('tx-kalip', 'C', ovr), 'Q');
  assert.equal(effectiveKey('tx-cizim', 'CTRL+P', ovr), 'CTRL+SHIFT+X');
  assert.equal(effectiveKey('tx-cizim', 'C', ovr), 'C');
  assert.equal(effectiveKey('tx-orgu', 'CTRL+P', ovr), 'CTRL+P');
});

test('yazı alanı ayrımı', () => {
  assert.equal(isEditable({ tagName: 'INPUT' }), true);
  assert.equal(isEditable({ tagName: 'TEXTAREA' }), true);
  assert.equal(isEditable({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isEditable({ tagName: 'BUTTON' }), false);
  assert.equal(isEditable(null), false);
});

test('yardım ekranı: tuş gösterimi ve bağlamdan bölüm (tekrarlar tek satır)', async () => {
  const { niceKey, sectionsFromContexts } = await import('../kb/help.js');
  assert.equal(niceKey('ctrl+shift+z'), 'Ctrl+Shift+Z');
  assert.equal(niceKey('ESCAPE'), 'Esc');
  assert.equal(niceKey('PAGEDOWN'), 'PageDown');
  const secs = sectionsFromContexts([{ id: 'a', title: 'A', root: () => null, keys: [{ key: 'CTRL+Z', label: 'Geri al' }, { key: 'ctrl+z', label: 'Geri al' }, { key: 'L', label: 'Çizgi' }] }]);
  assert.equal(secs.length, 1);
  assert.deepEqual(secs[0].items.map((i) => i.key), ['CTRL+Z', 'L']);
});

test('tekstil ve ayakkabı tuş listelerinde aynı ekranda iki iş aynı tuşu kullanmaz', async () => {
  const fs = await import('node:fs');
  for (const f of ['tx/app.js', 'ayk/app.js']) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const blocks = src.split(/\{ id: '(?=(?:tx|ayk)-)/).slice(1);
    assert.ok(blocks.length >= 2, f + ' bağlamları bulunamadı');
    for (const b of blocks) {
      const id = b.slice(0, b.indexOf("'"));
      const keys = [...b.matchAll(/key: '([^']+)'/g)].map((m) => m[1].toUpperCase());
      const labels = [...b.matchAll(/key: '([^']+)', label: '([^']+)'/g)].map((m) => m[1].toUpperCase() + '|' + m[2]);
      const byKey = new Map();
      for (const kl of labels) { const [k, l] = kl.split('|'); if (byKey.has(k) && byKey.get(k) !== l && !(l.startsWith('İleri') && byKey.get(k).startsWith('İleri'))) assert.fail(f + ' ' + id + ': ' + k + ' iki işte: ' + byKey.get(k) + ' / ' + l); byKey.set(k, l); }
      assert.ok(keys.length > 0, id);
    }
  }
});
