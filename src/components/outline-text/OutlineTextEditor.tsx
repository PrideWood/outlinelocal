import { useEffect, useRef } from "react";
import {
  indentSelectedOutlineLines,
  outdentSelectedOutlineLines,
} from "../../features/outline-text/outlineTextCommands";
import { ParsedOutlineRow } from "../../features/outline-text/outlineTextTypes";

type OutlineTextEditorProps = {
  value: string;
  parseRows: ParsedOutlineRow[];
  selectAllRequest: number;
  selectionRequest: { start: number; end: number; token: number } | null;
  onChange: (value: string) => void;
  onSelectionChange: (selection: { start: number; end: number }) => void;
};

export const OutlineTextEditor = ({
  value,
  parseRows,
  selectAllRequest,
  selectionRequest,
  onChange,
  onSelectionChange,
}: OutlineTextEditorProps) => {
  const invalidRows = parseRows.filter((row) => row.error !== null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const handledSelectAllRequestRef = useRef(0);
  const handledSelectionRequestRef = useRef<number | null>(null);

  const applyTextEdit = (
    nextValue: string,
    selection?: { start: number; end: number },
  ) => {
    onChange(nextValue);

    if (!selection) {
      return;
    }

    window.requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(selection.start, selection.end);
    });
  };

  useEffect(() => {
    if (selectAllRequest === 0 || selectAllRequest === handledSelectAllRequestRef.current) {
      return;
    }

    handledSelectAllRequestRef.current = selectAllRequest;
    textareaRef.current?.focus();
    textareaRef.current?.select();
    onSelectionChange({ start: 0, end: value.length });
  }, [onSelectionChange, selectAllRequest, value.length]);

  useEffect(() => {
    if (!selectionRequest || selectionRequest.token === handledSelectionRequestRef.current) {
      return;
    }

    handledSelectionRequestRef.current = selectionRequest.token;
    textareaRef.current?.focus();
    textareaRef.current?.setSelectionRange(selectionRequest.start, selectionRequest.end);
    onSelectionChange({ start: selectionRequest.start, end: selectionRequest.end });
  }, [onSelectionChange, selectionRequest]);

  const indentSelection = (direction: "in" | "out") => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const edit =
      direction === "in"
        ? indentSelectedOutlineLines(value, textarea.selectionStart, textarea.selectionEnd)
        : outdentSelectedOutlineLines(value, textarea.selectionStart, textarea.selectionEnd);

    applyTextEdit(edit.value, edit.selection);
  };

  return (
    <section className="editor-surface">
      <div className="editor-surface__header">
        <h2>Text View</h2>
        <span>Tab indents selected line(s), Shift+Tab outdents.</span>
      </div>

      <textarea
        ref={textareaRef}
        className="source-editor"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onSelect={(event) =>
          onSelectionChange({
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          })
        }
        onClick={(event) =>
          onSelectionChange({
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          })
        }
        onKeyUp={(event) =>
          onSelectionChange({
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          })
        }
        onKeyDown={(event) => {
          if (event.key !== "Tab") {
            return;
          }

          event.preventDefault();
          indentSelection(event.shiftKey ? "out" : "in");
        }}
      />

      <div className="source-footer">
        <div className="source-footer__summary">
          <strong>{invalidRows.length === 0 ? "Parse status: ready" : "Parse status: needs fixes"}</strong>
          <span>Use two spaces per depth level and `|` before the page number.</span>
        </div>

        <div className="source-errors">
          {invalidRows.length === 0 ? (
            <p className="source-errors__empty">No parse errors. Switching to tree view will reflect the same outline data.</p>
          ) : (
            invalidRows.map((row) => (
              <div key={`${row.lineNumber}-${row.raw}`} className="source-errors__row">
                <strong>Line {row.lineNumber}</strong>
                <span>{row.error}</span>
                <code>{row.raw}</code>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
