import test from "node:test";
import assert from "node:assert/strict";
import { CommandRegistry, CommandDispatcher, CommandError, parseCommandLine, tokenizeCommandLine, ShortcutResolver } from "../command-system/core.mjs";

test("Türkçe ve İngilizce adlar aynı komut kimliğine çözülür", () => {
  const registry = new CommandRegistry();
  registry.register({ id: "model.move", names: { tr: "Taşı", en: "Move" }, aliases: { tr: ["hareket ettir"], en: ["translate"] }, execute: () => true });
  assert.equal(registry.resolve("TAŞI").id, "model.move");
  assert.equal(registry.resolve("move").id, "model.move");
  assert.equal(registry.resolve("translate").id, "model.move");
});

test("komut satırı tırnaklı metin ve sayısal parametreleri ayrıştırır", () => {
  const registry = new CommandRegistry();
  registry.register({ id: "file.export", names: { tr: "Dışa aktar", en: "Export" }, aliases: { tr: [], en: [] }, parameters: [{ name: "format", type: "string", required: true }, { name: "filename", type: "string" }], execute: () => true });
  const parsed = parseCommandLine('EXPORT STEP "parça 01.step"', registry);
  assert.deepEqual(parsed.args, { format: "STEP", filename: "parça 01.step" });
  assert.deepEqual(tokenizeCommandLine('MOVE 10 "iki kelime"'), ["MOVE", "10", "iki kelime"]);
});

test("eksik ve geçersiz parametreler çalıştırmadan önce reddedilir", () => {
  const registry = new CommandRegistry();
  registry.register({ id: "model.box", names: { tr: "Kutu", en: "Box" }, parameters: [{ name: "width", type: "number", required: true, min: 0.01 }], execute: () => true });
  assert.throws(() => parseCommandLine("BOX", registry), { code: "MISSING_PARAMETER" });
  assert.throws(() => parseCommandLine("BOX abc", registry), { code: "INVALID_NUMBER" });
  assert.throws(() => parseCommandLine("BOX 0", registry), { code: "OUT_OF_RANGE" });
});

test("Dispatcher komut kimliğini tek yürütme noktasından çalıştırır", async () => {
  const registry = new CommandRegistry();
  let received;
  registry.register({ id: "view.fitAll", names: { tr: "Tümünü sığdır", en: "Fit All" }, execute: async (ctx) => { received = ctx.source; return "ok"; } });
  const dispatcher = new CommandDispatcher(registry);
  const result = await dispatcher.dispatch("view.fitAll", {}, { source: "keyboard" });
  assert.equal(result.ok, true);
  assert.equal(received, "keyboard");
});

test("kısayol çakışmaları reddedilir ve yazı alanları korunur", () => {
  const resolver = new ShortcutResolver();
  resolver.bind("CTRL+S", "file.save");
  assert.throws(() => resolver.bind("CTRL+S", "file.search"), { code: "SHORTCUT_CONFLICT" });
  const command = resolver.resolve({ key: "s", ctrlKey: true, target: { tagName: "INPUT" } });
  assert.equal(command, null);
});


test("tırnak içindeki kaçışlı tırnak ve ters eğik çizgi korunur", () => {
  assert.deepEqual(
    tokenizeCommandLine('EXPORT STEP "parça \\"özel\\" \\\\ klasör.step"'),
    ["EXPORT", "STEP", 'parça "özel" \\ klasör.step']
  );
  assert.deepEqual(tokenizeCommandLine('EXPORT "son\\\\"'), ["EXPORT", "son\\"]);
});

test("tırnak kapanmamışsa komut güvenli biçimde reddedilir", () => {
  assert.throws(() => tokenizeCommandLine('EXPORT "dosya.step'), { code: "UNCLOSED_QUOTE" });
});

test("CAD komut örnekleri için Türkçe ve İngilizce adlar ortak komuta çözülür", () => {
  const registry = new CommandRegistry();
  registry.register({ id: "model.moveSelected", names: { tr: "Seçili parçayı taşı", en: "Move selected part" }, aliases: { tr: ["taşı"], en: ["move", "translate"] }, parameters: [{ name: "dx", type: "number" }, { name: "dy", type: "number" }, { name: "dz", type: "number" }], execute: () => true });
  registry.register({ id: "model.rotateSelected", names: { tr: "Seçili parçayı döndür", en: "Rotate selected part" }, aliases: { tr: ["döndür"], en: ["rotate"] }, parameters: [{ name: "axis", type: "string", required: true }, { name: "degrees", type: "number", required: true }], execute: () => true });
  assert.equal(registry.resolve("MOVE").id, "model.moveSelected");
  assert.equal(registry.resolve("TAŞI").id, "model.moveSelected");
  assert.equal(registry.resolve("ROTATE").id, "model.rotateSelected");
  assert.deepEqual(parseCommandLine("MOVE 10 0 -5", registry).args, { dx: 10, dy: 0, dz: -5 });
  assert.deepEqual(parseCommandLine("ROTATE Z 90", registry).args, { axis: "Z", degrees: 90 });
});
