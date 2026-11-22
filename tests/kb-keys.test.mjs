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
