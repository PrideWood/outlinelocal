import {
  BadgeQuestionMark,
  FolderOpen,
  ListTree,
  Redo2,
  Save,
  TextAlignStart,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { acceptPdfFile } from "../../services/file/openFile";
import { EditorMode } from "../../features/document/useOutlineDocument";

const iconProps = {
  size: 18,
  strokeWidth: 1.9,
  "aria-hidden": true,
} as const;

type ToolbarProps = {
  currentFileName: string | null;
  editorMode: EditorMode;
  isExporting: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onOpenPdf: (file: File | null) => void;
  onExportPdf: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSwitchMode: (mode: EditorMode) => void;
};

export const Toolbar = ({
  currentFileName,
  editorMode,
  isExporting,
  canUndo,
  canRedo,
  onOpenPdf,
  onExportPdf,
  onUndo,
  onRedo,
  onSwitchMode,
}: ToolbarProps) => {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <>
      <header className="toolbar">
        <div className="toolbar__group">
          <strong className="toolbar__brand">OutlineLocal</strong>
          <label className="toolbar__file icon-button" title="Open PDF" aria-label="Open PDF">
            <FolderOpen {...iconProps} />
            <input
              accept={acceptPdfFile}
              className="sr-only"
              type="file"
              onChange={(event) => onOpenPdf(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            className="icon-button"
            type="button"
            disabled={isExporting}
            title={isExporting ? "Exporting PDF..." : "Save / Export PDF"}
            aria-label={isExporting ? "Exporting PDF" : "Save / Export PDF"}
            onClick={onExportPdf}
          >
            <Save {...iconProps} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="Help"
            aria-label="Help"
            onClick={() => setIsHelpOpen(true)}
          >
            <BadgeQuestionMark {...iconProps} />
          </button>
          <button
            className="icon-button"
            type="button"
            disabled={!canUndo}
            title="Undo"
            aria-label="Undo"
            onClick={onUndo}
          >
            <Undo2 {...iconProps} />
          </button>
          <button
            className="icon-button"
            type="button"
            disabled={!canRedo}
            title="Redo"
            aria-label="Redo"
            onClick={onRedo}
          >
            <Redo2 {...iconProps} />
          </button>
          <span className="toolbar__meta">{currentFileName ?? "No PDF selected"}</span>
        </div>

        <div className="toolbar__group toolbar__group--modes">
          <button
            className={editorMode === "text" ? "is-active" : ""}
            type="button"
            title="Text View"
            aria-label="Text View"
            onClick={() => onSwitchMode("text")}
          >
            <TextAlignStart {...iconProps} />
          </button>
          <button
            className={editorMode === "tree" ? "is-active" : ""}
            type="button"
            title="Tree View"
            aria-label="Tree View"
            onClick={() => onSwitchMode("tree")}
          >
            <ListTree {...iconProps} />
          </button>
        </div>
      </header>

      {isHelpOpen ? (
        <div className="help-dialog__backdrop" role="presentation" onMouseDown={() => setIsHelpOpen(false)}>
          <section
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="outline-help-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="help-dialog__header">
              <h2 id="outline-help-title">OutlineLocal Help</h2>
              <button type="button" onClick={() => setIsHelpOpen(false)}>
                Close
              </button>
            </header>
            <p>
              OutlineLocal is a local-first PDF bookmark and table-of-contents editor. Files are opened and processed
              in your browser; there is no backend upload workflow.
            </p>
            <ul>
              <li>Open a local PDF with the folder button to read its existing outline.</li>
              <li>Use Text View for title and page-number editing in the `Title | Page` format.</li>
              <li>Use Tree View to inspect structure, select rows, collapse branches, and adjust hierarchy.</li>
              <li>Press Tab to indent selected lines or rows; press Shift+Tab to outdent them.</li>
              <li>Use Save / Export PDF to download an edited PDF with the current outline.</li>
            </ul>
          </section>
        </div>
      ) : null}
    </>
  );
};
