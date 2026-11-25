import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { uret, mdHtml, kimlik } from '../tools/kilavuz.mjs';

test('kilavuz/index.html, docs kaynaklarından üretilenle aynı (güncel)', () => {
  const dosya = fs.readFileSync(new URL('../kilavuz/index.html', import.meta.url), 'utf8');
  assert.equal(dosya, uret(), 'docs/KISAYOLLAR.md ya da docs/KILAVUZ-GIRIS.md değişmiş: node tools/kilavuz.mjs');
});

test('kılavuz bölümleri ve menü bağlantılarının hedefleri var', () => {
  const html = uret();
  for (const id of ['telefonda-nasil-komut-verilir', 'sesli-komut-makine-bolumu', '4-tekstil-ve-moda', '5-ayakkabi-modelhanesi']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.equal(kimlik('5. Ayakkabı Modelhanesi'), '5-ayakkabi-modelhanesi');
  for (const f of ['tekstil.html', 'ayakkabi.html']) {
    const s = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const m = /href="\.\/kilavuz\/index\.html#([^"]+)"/.exec(s);
    assert.ok(m && html.includes(`id="${m[1]}"`), f + ' kılavuz bağlantısı');
  }
});

test('markdown çevirici HTML kaçışı yapar, tablo ve kod üretir', () => {
  const h = mdHtml('| A | B |\n|---|---|\n| `x<y` | **k** \\| t |\n\n<script>x</script>');
  assert.ok(h.includes('<code>x&lt;y</code>'));
  assert.ok(h.includes('<b>k</b> | t'));
  assert.ok(!h.includes('<script>'));
});
