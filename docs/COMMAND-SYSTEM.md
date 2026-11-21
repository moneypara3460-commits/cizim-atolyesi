# Advanced Command System

This branch introduces the UI-agnostic foundation for the desktop command ecosystem.

## Scope of this first increment
- Stable command IDs and a bilingual Turkish/English alias registry.
- Safe tokenization and typed positional parameter parsing, including escaped quotes and backslashes inside quoted arguments.
- A single dispatcher for keyboard, palette, terminal, and macro callers.
- Shortcut conflict detection and editable-field protection.
- A first desktop adapter for box/cylinder/sphere/cone creation, selected-part deletion, undo/redo, fit-all, and save.
- A searchable command palette opened with Ctrl+K; it accepts commands such as `BOX 100 50 30`.
- Keyboard shortcuts are scoped to the focused 3D workspace. Editable fields are excluded.
- No arbitrary code evaluation.

## Integration boundary
The current application is a browser-based JavaScript application. The command core is deliberately framework-agnostic and does not mutate CAD state. Existing model operations must be connected later through explicit adapters after their actual entry points and undo/redo behavior are mapped. Do not duplicate the model history.

## Initial tests
Run: `node --test tests/command-system.test.mjs`

## Next integration tasks
1. Map existing UI actions to stable command IDs.
2. Add an adapter that invokes existing functions without rewriting them.
3. Add a non-intrusive command palette and terminal to the desktop shell.
4. Add keyboard listeners only after focus and browser shortcut conflicts are fully specified.
