// Çizim Atölyesi Advanced Command System
// Safe, UI-agnostic command registry/parser/dispatcher foundation.
// Existing CAD functions are connected later through explicit adapters.

const normalize = (value) => String(value ?? "")
  .trim()
  .toLocaleLowerCase("tr-TR")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/ı/g, "i");

export class CommandError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CommandError";
    this.code = code;
    this.details = details;
  }
}

export class CommandRegistry {
  #commands = new Map();
  #aliases = new Map();

  register(definition) {
    if (!definition || typeof definition.id !== "string" || !definition.id.trim()) {
      throw new CommandError("INVALID_DEFINITION", "Komut kimliği zorunludur.");
    }
    if (this.#commands.has(definition.id)) {
      throw new CommandError("DUPLICATE_ID", `Komut zaten kayıtlı: ${definition.id}`);
    }
    if (typeof definition.execute !== "function") {
      throw new CommandError("MISSING_EXECUTOR", `Komut çalıştırıcısı eksik: ${definition.id}`);
    }

    const safe = Object.freeze({
      id: definition.id,
      names: Object.freeze({ tr: definition.names?.tr || definition.id, en: definition.names?.en || definition.id }),
      aliases: Object.freeze({
        tr: Object.freeze([...(definition.aliases?.tr || [])]),
        en: Object.freeze([...(definition.aliases?.en || [])])
      }),
      description: Object.freeze({ tr: definition.description?.tr || "", en: definition.description?.en || "" }),
      category: definition.category || "general",
      shortcuts: Object.freeze([...(definition.shortcuts || [])]),
      parameters: Object.freeze([...(definition.parameters || [])]),
      requiresSelection: Boolean(definition.requiresSelection),
      canExecute: definition.canExecute || (() => true),
      execute: definition.execute
    });

    const terms = [
      safe.names.tr, safe.names.en,
      ...safe.aliases.tr, ...safe.aliases.en,
      definition.id
    ].map(normalize).filter(Boolean);

    for (const term of terms) {
      const owner = this.#aliases.get(term);
      if (owner && owner !== safe.id) {
        throw new CommandError("ALIAS_CONFLICT", `Komut adı başka bir komutla çakışıyor: ${term}`, { owner, incoming: safe.id });
      }
    }
    this.#commands.set(safe.id, safe);
    for (const term of terms) this.#aliases.set(term, safe.id);
    return safe;
  }

  get(id) { return this.#commands.get(id) || null; }
  resolve(name) { return this.#commands.get(this.#aliases.get(normalize(name))) || null; }
  list({ category } = {}) {
    return [...this.#commands.values()].filter((c) => !category || c.category === category);
  }
}

export function tokenizeCommandLine(source) {
  const input = String(source ?? "").trim();
  if (!input) return [];
  const tokens = [];
  let token = "", quote = null, escaped = false;
  for (const char of input) {
    if (escaped) { token += char; escaped = false; continue; }
    if (char === "\\" && quote) { escaped = true; continue; }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }
    if (/\s/.test(char) && !quote) {
      if (token) { tokens.push(token); token = ""; }
      continue;
    }
    token += char;
  }
  if (escaped) token += "\\";
  if (quote) throw new CommandError("UNCLOSED_QUOTE", "Komut satırında kapanmamış tırnak var.");
  if (token) tokens.push(token);
  return tokens;
}

export function parseCommandLine(source, registry) {
  const tokens = tokenizeCommandLine(source);
  if (!tokens.length) return null;
  const command = registry.resolve(tokens[0]);
  if (!command) throw new CommandError("UNKNOWN_COMMAND", `Bilinmeyen komut: ${tokens[0]}`, { input: tokens[0] });
  const rawArgs = tokens.slice(1);
  const args = {};
  for (let i = 0; i < command.parameters.length; i++) {
    const parameter = command.parameters[i];
    const raw = rawArgs[i];
    if (raw == null) {
      if (parameter.required) throw new CommandError("MISSING_PARAMETER", `Eksik parametre: ${parameter.name}`, { parameter: parameter.name });
      continue;
    }
    let value = raw;
    if (parameter.type === "number") {
      value = Number(raw);
      if (!Number.isFinite(value)) throw new CommandError("INVALID_NUMBER", `Geçersiz sayı: ${raw}`, { parameter: parameter.name });
      if (parameter.min != null && value < parameter.min || parameter.max != null && value > parameter.max) {
        throw new CommandError("OUT_OF_RANGE", `Parametre aralık dışında: ${parameter.name}`, { parameter: parameter.name, min: parameter.min, max: parameter.max });
      }
    } else if (parameter.type === "boolean") {
      const v = normalize(raw);
      if (!["true", "1", "evet", "on"].includes(v) && !["false", "0", "hayir", "off"].includes(v)) {
        throw new CommandError("INVALID_BOOLEAN", `Geçersiz mantıksal değer: ${raw}`, { parameter: parameter.name });
      }
      value = ["true", "1", "evet", "on"].includes(v);
    }
    args[parameter.name] = value;
  }
  if (rawArgs.length > command.parameters.length) {
    throw new CommandError("TOO_MANY_PARAMETERS", "Gereğinden fazla parametre girildi.", { expected: command.parameters.length, received: rawArgs.length });
  }
  return { command, args };
}

export class CommandDispatcher {
  constructor(registry, { getContext = () => ({}), onResult = () => {}, onError = () => {} } = {}) {
    this.registry = registry;
    this.getContext = getContext;
    this.onResult = onResult;
    this.onError = onError;
    this.running = false;
  }

  async dispatch(commandOrId, args = {}, metadata = {}) {
    if (this.running) throw new CommandError("COMMAND_BUSY", "Başka bir komut çalışıyor.");
    const command = typeof commandOrId === "string" ? this.registry.get(commandOrId) : commandOrId;
    if (!command) throw new CommandError("COMMAND_NOT_FOUND", "Komut bulunamadı.");
    const context = { ...this.getContext(), source: metadata.source || "api", language: metadata.language || "tr" };

    try {
      if (!command.canExecute(context, args)) {
        throw new CommandError("NOT_AVAILABLE", "Bu komut mevcut çalışma bağlamında kullanılamıyor.", { commandId: command.id });
      }
      this.running = true;
      const result = await command.execute(context, args, metadata);
      const payload = { ok: true, commandId: command.id, result, source: context.source };
      this.onResult(payload);
      return payload;
    } catch (error) {
      const normalized = error instanceof CommandError ? error : new CommandError("EXECUTION_FAILED", error?.message || "Komut çalıştırılamadı.", { cause: error });
      this.onError({ commandId: command.id, error: normalized, source: context.source });
      throw normalized;
    } finally {
      this.running = false;
    }
  }

  async dispatchLine(line, metadata = {}) {
    const parsed = parseCommandLine(line, this.registry);
    if (!parsed) return null;
    return this.dispatch(parsed.command, parsed.args, { ...metadata, source: metadata.source || "terminal" });
  }
}

export function normalizeShortcut(event) {
  const key = String(event.key || "").toUpperCase();
  if (!key) return null;
  const parts = [];
  if (event.ctrlKey) parts.push("CTRL");
  if (event.altKey) parts.push("ALT");
  if (event.shiftKey) parts.push("SHIFT");
  if (event.metaKey) parts.push("META");
  parts.push(key === " " ? "SPACE" : key);
  return parts.join("+");
}

export function isEditableTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  return target.isContentEditable === true ||
    ["input", "textarea", "select"].includes(tag) ||
    Boolean(target.closest?.('[contenteditable="true"], [role="textbox"], .cm-editor, .monaco-editor'));
}

export class ShortcutResolver {
  constructor() { this.bindings = new Map(); }

  bind(shortcut, commandId) {
    const key = String(shortcut).toUpperCase().replace(/\s+/g, "");
    const existing = this.bindings.get(key);
    if (existing && existing !== commandId) {
      throw new CommandError("SHORTCUT_CONFLICT", `${key} kısayolu zaten başka bir komuta atanmış.`, { shortcut: key, existing, incoming: commandId });
    }
    this.bindings.set(key, commandId);
  }

  resolve(event, { allowInEditable = false } = {}) {
    if (!allowInEditable && isEditableTarget(event.target)) return null;
    return this.bindings.get(normalizeShortcut(event)) || null;
  }
}
