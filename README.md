# OutlineLocal

OutlineLocal is a local-first utility for editing PDF bookmark and table-of-contents data in the browser.

## Current status

This repository now reflects the corrected product direction:

- Vite + React + TypeScript app scaffold
- Desktop-first outline editor layout
- Centered working frame with a focused max width
- Shared outline document state for text view and tree view
- Structured outline text parser and serializer using `Title | Page`
- Text-first editing workflow with Tab / Shift+Tab indentation
- Always-visible editing tools bar below the primary menu
- Immutable bookmark tree commands for editing hierarchy
- Real PDF outline reading through `pdfBookmarkAdapter`
- Adapter diagnostics for PDF.js outline count, raw `/Outlines` detection, and fallback usage
- Initial local PDF outline export through `pdfBookmarkAdapter`

Implemented now:

- Switch between Text View and Tree View
- Edit outline lines directly in text mode
- Indent/outdent the current line or selected lines with Tab / Shift+Tab
- Parse indentation-based hierarchy from outline text
- Surface invalid text rows instead of silently dropping them
- Select multiple Tree View rows with Shift-click ranges or Ctrl/Cmd-click toggles
- Batch indent, outdent, move, and delete selected tree rows through shared commands
- Select bookmark nodes
- Rename titles in Text View
- Edit page numbers in Text View
- Add sibling
- Add child
- Delete node
- Expand / collapse nodes
- Move up / move down
- Indent / outdent
- Open a local PDF and load its existing outline data into both views
- Show explicit loading, no-outline, and extraction-failed states
- Fall back to direct standard `/Outlines` tree traversal when PDF.js returns no outline items
- Use secondary editing tools for find, replace, select all, split page/title, auto hierarchy, and page offset
- Split trailing page numbers from copied/OCR TOC lines such as `第一章 绪论1` into `第一章 绪论 | 1`
- Import outline text from a local text file
- Export outline text locally
- Export an edited PDF locally by appending a new standard outline tree and downloading `*.edited.pdf`
- Keep all PDF processing local in the browser

Not implemented yet:

- Full PDF rewrite support for compressed/cross-reference-stream edge cases
- File System Access API Save As workflow
- Draft persistence
- Split view
- Automated tests

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

This app is a static Vite frontend and does not require a backend, upload service, auth service, or runtime server.
The GitHub Actions workflow in `.github/workflows/pages.yml` builds `dist/` with `npm run build` and deploys it from the `main` branch using GitHub's standard Pages artifact flow.

Repository setup:

1. Push this repository to GitHub.
2. In GitHub, open Settings -> Pages.
3. Set Source to "GitHub Actions".
4. Push to `main` or run the "Deploy to GitHub Pages" workflow manually.

The Vite `base` is configured as `./` so built assets work from either a repository subpath such as `https://USER.github.io/REPO/` or a future custom-domain root.

### Future custom domain

The intended custom domain is `ol.dacnote.com`. A `CNAME` file is intentionally not committed yet because enabling it before DNS and GitHub Pages domain settings are ready can make the published site resolve incorrectly.

When binding the domain later:

1. Add the custom domain `ol.dacnote.com` in GitHub Pages settings.
2. Configure DNS for `ol.dacnote.com` as a CNAME pointing to the GitHub Pages hostname.
3. Add `public/CNAME` containing exactly `ol.dacnote.com`.
4. Commit and push the `CNAME` file so the Pages deployment preserves the custom domain.

## Current mock / placeholder boundaries

- The app still starts with sample outline data before a PDF is opened.
- PDF outline extraction depends on `pdfjs-dist` successfully exposing standard PDF outlines.
- The raw fallback supports straightforward indirect-object outline trees with `/First`, `/Next`, `/Title`, `/Dest`, and `/A /D`; it is not a full replacement for a complete PDF parser.
- PDF export currently uses a narrow incremental-update writer. It appends a new outline tree and updates the catalog locally, then falls back to a browser download. PDFs with unsupported catalog/xref structures should produce a visible export error instead of a fake success.
- Tree View is intentionally hierarchy-only. Use Text View for title and page-number edits; use Tree View for selection, collapse/expand, and hierarchy operations.
