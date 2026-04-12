# Next Phase TODO

- Verify incremental PDF outline export against a broader fixture set and decide whether to replace it with a fuller WASM PDF engine.
- Add File System Access API Save As support with download fallback preserved.
- Add tests for outline text parsing, serialization, and tree editing commands.
- Add tests for multiline Tab / Shift+Tab text indentation behavior.
- Add tests for Split Title/Page with direct trailing digits, dotted leaders, ellipsis leaders, and ambiguous number-only lines.
- Add tests for Tree View multi-row selection and batch indent/outdent/delete.
- Add coverage for PDFs with string destinations, explicit destinations, and empty outlines.
- Add fixture coverage for PdgCntEditor-created PDFs, including files where PDF.js returns zero outlines but raw `/Outlines` exists.
- Improve the fallback parser for object streams and compressed outline objects if real fixtures require it.
- Add export fixture coverage for classic xref PDFs, xref-stream PDFs, Unicode bookmark titles, empty outlines, and deeply nested outlines.
- Add tests that Tree View remains hierarchy-only and does not expose title/page field editing.
- Improve text parsing diagnostics for duplicate separators, deep indentation jumps, and malformed pages.
- Add drag-and-drop PDF/text import in the editor workflow.
- Add optional split view once text and tree workflows feel solid.
