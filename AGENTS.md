# AGENTS.md

## Project Name
OutlineLocal

## Project Summary
OutlineLocal is a local-first web application for editing PDF bookmarks / outlines in the browser.

The app must allow users to:
- open a local PDF file
- inspect existing bookmark / outline trees
- create, rename, delete, reorder, indent, and outdent bookmarks
- change bookmark target pages
- paste plain-text table of contents and convert it into a hierarchical bookmark tree
- export a modified PDF

## Core Product Principles
1. **Local-first**
   - All PDF processing must happen locally in the browser.
   - No file upload.
   - No backend.
   - No cloud dependency for core features.

2. **Single-purpose**
   - This is not a general PDF editor.
   - The product focuses on bookmark / outline editing only.

3. **Cross-platform**
   - The app should work in modern desktop browsers.
   - Enhanced save support may exist in Chromium browsers, but core functionality must still work elsewhere.

4. **Safe editing**
   - The original file should never be silently overwritten unless the browser explicitly supports that workflow and the user chooses it.
   - Exporting a new file is always acceptable as fallback behavior.

5. **Swappable PDF engine**
   - PDF rendering and PDF outline read/write logic must be separated.
   - The bookmark engine may need to be replaced if the first library proves unreliable.

---

## Product Scope

### In Scope
- Open local PDF
- Render PDF pages
- Read outline tree from PDF
- Display and edit outline tree
- Add / remove / rename bookmarks
- Reorder bookmarks
- Change hierarchy level
- Change target page
- Import outline structure from pasted TOC text
- Apply page offset
- Export modified PDF
- Save draft state locally
- Offline-capable app shell is desirable

### Out of Scope
- OCR
- text editing inside PDF pages
- annotation editing
- account system
- remote sync
- collaboration
- server-side processing
- AI features
- full document conversion pipeline

---

## Required Tech Direction

### Frontend
- React
- TypeScript
- Vite

### PDF Viewing
- Use PDF.js for rendering and page navigation.

### PDF Bookmark Read/Write
- Use a PDF engine capable of reading and writing PDF outlines/bookmarks.
- Prefer a WASM-based solution if possible.
- Keep the engine behind an adapter interface.
- Do not tightly couple UI code to a specific PDF manipulation library.

### Local File Access
- Use standard browser file input and drag-and-drop for opening files.
- Use File System Access API when available for enhanced save behavior.
- Always provide a download-based export fallback.

### Local Persistence
- Use IndexedDB and/or OPFS for draft persistence when useful.
- Do not store full PDFs unnecessarily unless explicitly required by a feature.
- Prefer storing lightweight project state, bookmark trees, and parser settings.

---

## Architecture Rules

### Required Separation
The codebase must be separated into these concerns:

1. **PDF viewer layer**
   - Responsible only for rendering, page navigation, zoom, and viewer state.

2. **Bookmark state layer**
   - Responsible for the in-memory bookmark tree and edit commands.

3. **TOC parser layer**
   - Responsible for turning pasted plain text into parsed rows and a bookmark tree.

4. **PDF bookmark adapter**
   - Responsible for reading outline data from PDFs and writing outline data back to PDFs.

5. **File open/save layer**
   - Responsible for browser file access and export behavior.

Do not merge these concerns into large React components.

### Adapter Boundary
Any PDF engine must be wrapped behind typed adapters.

Expected adapters:
- `pdfViewerAdapter`
- `pdfBookmarkAdapter`
- `fileSaveAdapter` or equivalent

React components must not directly manipulate low-level PDF library objects.

### State Management
Use simple, explicit, typed state management.
A lightweight store such as Zustand is acceptable.
Do not over-engineer with unnecessary abstraction early.

### Command-oriented Editing
Bookmark edits should be implemented as typed command-like utilities where practical.

Examples:
- `addSibling`
- `addChild`
- `removeNode`
- `renameNode`
- `moveNode`
- `indentNode`
- `outdentNode`
- `updateNodePage`

These functions should be pure and immutable whenever possible.

This is important because undo/redo will likely be added.

---

## Data Model Rules

### Bookmark Node
Use a typed tree structure similar to:

```ts
type BookmarkNode = {
  id: string;
  title: string;
  pageIndex: number;
  x?: number | null;
  y?: number | null;
  zoom?: number | null;
  children: BookmarkNode[];
  isOpen?: boolean;
  color?: string | null;
  bold?: boolean;
  italic?: boolean;
};
```

### Internal Conventions
- `pageIndex` should be 0-based internally.
- UI may display 1-based page numbers.
- IDs must be stable enough for React rendering and editing workflows.
- The UI must not depend on PDF-engine-specific node identities.

### Document State
Maintain a clear state model for:
- current file metadata
- page count
- current page
- bookmark tree
- page offset
- unsaved changes

---

## UI and UX Rules

### Layout
Desktop-first layout is acceptable for MVP.

Recommended structure:
- top toolbar
- left bookmark tree panel
- center PDF viewer panel
- right properties/import panel

### Bookmark Tree UX
Must support:
- selecting a node
- inline rename
- add sibling
- add child
- delete
- expand/collapse
- reorder
- indent/outdent
- page target editing

### Viewer Sync
- Clicking a bookmark should navigate the viewer to the target page.
- The user should be able to assign the current page to the selected bookmark.
- Page display in UI should be clear and consistent.

### Import UX
The TOC import experience should include:
- paste area
- parse preview
- error visibility
- page offset control
- confirmation before replacing the current bookmark tree

### Error UX
Do not hide errors.
When parsing fails or exporting fails, show concrete actionable messages.

Bad:
- “Something went wrong”

Good:
- “12 lines could not be parsed because no trailing page number was found.”
- “Export failed because the selected PDF engine did not return writable outline data.”

---

## Parsing Rules for TOC Import

The project must support converting pasted text into bookmarks.

### Supported Patterns
The parser should aim to support:
- title + page number
- dotted leaders
- tab-separated title/page
- leading whitespace indentation
- simple numbering-based hierarchy inference

Examples:
- `Chapter 1 Introduction 1`
- `Chapter 2 Methods..........15`
- `1.1 Background 3`
- `    1.1.1 Scope 5`

### Parser Behavior
- Parse line by line.
- Extract the trailing integer page number when available.
- Preserve raw line text.
- Infer indentation level from leading spaces/tabs first.
- Optionally infer hierarchy from numbering patterns.
- Keep failed rows visible instead of silently dropping them.
- Support page offset application before converting rows into bookmarks.

### Parser Output
Keep a typed intermediate representation before generating the bookmark tree.

Example:
```ts
type ParsedTocRow = {
  raw: string;
  title: string;
  pageNumber: number | null;
  indentLevel: number;
  error?: string | null;
};
```

---

## Save and Export Rules

### Opening Files
Support:
- file input
- drag and drop

### Saving Files
Implement two modes:

1. **Enhanced mode**
   - when File System Access API is available
   - support Save / Save As if practical

2. **Fallback mode**
   - export a Blob and trigger browser download

### Export Safety
- Do not destroy the original in-memory state after export.
- Preserve filename when possible.
- Prefer output names like:
  - `original.bookmarked.pdf`
  - `original.edited.pdf`

### Browser Compatibility
The app should degrade gracefully if advanced file APIs are unavailable.

---

## Performance Rules

### PDF Rendering
- Do not render all pages eagerly.
- Focus on current page and minimal nearby state.
- Avoid expensive rerenders on every bookmark edit.

### Heavy Work
If PDF parsing or outline conversion is expensive:
- move that work into a Web Worker where practical

### Tree Operations
Bookmark tree utilities should be efficient and predictable.
Avoid mutation bugs and deeply tangled component-local state.

---

## Testing Expectations

### Must Test
At minimum, test:
- tree editing utilities
- TOC parser
- page offset application
- conversion between parsed rows and bookmark tree
- save fallback logic where practical

### Manual Verification
Every export-related change should be manually verified with sample PDFs.

At least verify:
- bookmark titles remain correct
- hierarchy is preserved
- page jumps still work
- exported file opens in common PDF readers

---

## Code Quality Rules

### TypeScript
- Prefer explicit types.
- Avoid `any` unless there is a strong reason.
- If a third-party library forces unknown structures, isolate them near the adapter layer.

### Components
- Keep components focused.
- Avoid giant components that mix UI, parsing, file IO, and PDF logic.
- Extract reusable UI pieces when they become stable.

### Naming
Use direct names.
Prefer:
- `BookmarkTree`
- `BookmarkNodeRow`
- `parseTocText`
- `exportPdfWithBookmarks`

Avoid vague names like:
- `handleData`
- `processThing`
- `manager`

### Comments
Write comments where intent is not obvious.
Do not add noisy comments that merely restate the code.

---

## Suggested Directory Shape

```txt
src/
  app/
    App.tsx
  components/
    toolbar/
    bookmark-tree/
    pdf-viewer/
    toc-import/
    dialogs/
  features/
    bookmarks/
      bookmarkTypes.ts
      bookmarkTreeUtils.ts
      bookmarkCommands.ts
      bookmarkHistory.ts
    toc-parser/
      parseTocText.ts
      tocHierarchy.ts
      tocTypes.ts
    pdf/
      pdfViewerAdapter.ts
      pdfBookmarkAdapter.ts
      pdfTypes.ts
  services/
    file/
      openFile.ts
      saveFile.ts
    storage/
      draftStorage.ts
  workers/
    pdfWorker.ts
  utils/
  styles/
```

This structure can evolve, but the separation of concerns must remain.

---

## Development Priorities

Build in this order unless blocked:

### Phase 1: UI Skeleton
- app shell
- toolbar
- bookmark tree with mock data
- PDF viewer placeholder
- right-side import/properties panel

### Phase 2: Bookmark Tree Editing
- selection
- rename
- add/delete
- move
- indent/outdent
- update page target
- clean immutable commands

### Phase 3: TOC Parser
- parse plain text
- preview rows
- show errors
- generate bookmark tree
- apply page offset

### Phase 4: PDF Viewer Integration
- open local PDF
- render current page with PDF.js
- page navigation
- viewer/bookmark sync

### Phase 5: PDF Bookmark Adapter
- read real outline data from PDF
- map to internal tree
- write tree back to PDF
- export modified PDF

### Phase 6: Save, Drafts, and Polish
- save / save as
- download fallback
- unsaved state
- local draft persistence
- better errors
- basic keyboard shortcuts

---

## Non-Negotiable Constraints

1. No backend should be introduced.
2. No upload-to-server workaround is allowed.
3. Do not turn this into a general PDF editor.
4. Keep the bookmark engine abstracted.
5. Keep all critical flows usable offline after the app is loaded.
6. Do not fake core file editing with placeholder success states.

---

## When Blocked
If a chosen PDF library cannot reliably read and write existing outlines:
- do not force the whole app around that library
- preserve adapter interfaces
- swap the engine
- keep UI and bookmark logic intact

If a feature seems too large:
- cut scope
- preserve architecture
- ship the smaller working version

---

## Definition of Done for MVP
The MVP is complete only if a user can:

1. open a local PDF
2. see PDF pages in the app
3. load existing bookmarks from that PDF
4. edit the bookmark tree in UI
5. export a modified PDF locally
6. open the exported file in a normal PDF reader and confirm the bookmarks work

If any of the above is missing, the MVP is not done.

---

## Preferred Mindset
Build a practical, reliable, narrow tool.

Do not chase every PDF feature.
Do not over-design.
Do not couple the UI to a fragile PDF library.
Do not sacrifice local-first principles for convenience.

The ideal result is a modern, browser-based alternative to traditional bookmark-editing utilities, with clearer UX and safe local processing.