import { useMemo, useState } from "react";
import { BookmarkTree } from "../components/bookmark-tree/BookmarkTree";
import { EditingToolsBar } from "../components/editing-tools/EditingToolsBar";
import { OutlineTextEditor } from "../components/outline-text/OutlineTextEditor";
import { StatusBar } from "../components/status-bar/StatusBar";
import { Toolbar } from "../components/toolbar/Toolbar";
import { BookmarkNode } from "../features/bookmarks/bookmarkTypes";
import { useOutlineDocument } from "../features/document/useOutlineDocument";
import {
  applyHierarchyFromNumbering,
  applyPageOffsetToOutlineText,
  indentSelectedOutlineLines,
  outdentSelectedOutlineLines,
  replaceAllInText,
  removeEmptyOutlineLines,
  splitTrailingPageNumbers,
} from "../features/outline-text/outlineTextCommands";

const collectBookmarkIds = (nodes: BookmarkNode[]): string[] =>
  nodes.flatMap((node) => [node.id, ...collectBookmarkIds(node.children)]);

export const App = () => {
  const document = useOutlineDocument();
  const [findText, setFindText] = useState("");
  const [replacementText, setReplacementText] = useState("");
  const [pageOffset, setPageOffset] = useState(0);
  const [textSelection, setTextSelection] = useState({ start: 0, end: 0 });
  const [selectAllRequest, setSelectAllRequest] = useState(0);
  const [selectionRequest, setSelectionRequest] = useState<{
    start: number;
    end: number;
    token: number;
  } | null>(null);
  const allBookmarkIds = useMemo(() => collectBookmarkIds(document.bookmarks), [document.bookmarks]);

  const applyTextEdit = (nextText: string) => {
    document.applySourceText(nextText);
  };

  const applyTextIndent = (direction: "in" | "out") => {
    const edit =
      direction === "in"
        ? indentSelectedOutlineLines(document.sourceText, textSelection.start, textSelection.end)
        : outdentSelectedOutlineLines(document.sourceText, textSelection.start, textSelection.end);

    document.applySourceText(edit.value);
    setSelectionRequest({ ...edit.selection, token: Date.now() });
  };

  const findNext = () => {
    if (findText.length === 0) {
      return;
    }

    const nextIndex = document.sourceText.indexOf(findText, textSelection.end);
    const wrappedIndex = nextIndex === -1 ? document.sourceText.indexOf(findText) : nextIndex;

    if (wrappedIndex >= 0) {
      document.setEditorMode("text");
      setSelectionRequest({
        start: wrappedIndex,
        end: wrappedIndex + findText.length,
        token: Date.now(),
      });
    }
  };

  const replaceNext = () => {
    if (findText.length === 0) {
      return;
    }

    const selectedText = document.sourceText.slice(textSelection.start, textSelection.end);
    const replaceStart =
      selectedText === findText
        ? textSelection.start
        : document.sourceText.indexOf(findText, textSelection.end);
    const wrappedStart = replaceStart === -1 ? document.sourceText.indexOf(findText) : replaceStart;

    if (wrappedStart === -1) {
      return;
    }

    const nextText =
      document.sourceText.slice(0, wrappedStart) +
      replacementText +
      document.sourceText.slice(wrappedStart + findText.length);
    const nextCaret = wrappedStart + replacementText.length;
    document.applySourceText(nextText);
    document.setEditorMode("text");
    setSelectionRequest({ start: nextCaret, end: nextCaret, token: Date.now() });
  };

  return (
    <div className="app-shell">
      <div className="app-frame">
        <Toolbar
          currentFileName={document.currentFileName}
          editorMode={document.editorMode}
          isExporting={document.isExporting}
          onOpenPdf={document.openPdfFile}
          onExportPdf={document.exportPdf}
          onSwitchMode={document.setEditorMode}
        />

        <EditingToolsBar
          editorMode={document.editorMode}
          findText={findText}
          replacementText={replacementText}
          pageOffset={pageOffset}
          onFindTextChange={setFindText}
          onReplacementTextChange={setReplacementText}
          onPageOffsetChange={setPageOffset}
          onFind={findNext}
          onReplace={replaceNext}
          onReplaceAll={() => applyTextEdit(replaceAllInText(document.sourceText, findText, replacementText))}
          onSelectAll={() => {
            if (document.editorMode === "text") {
              setSelectAllRequest((value) => value + 1);
              return;
            }
            document.setSelectedNodeIds(allBookmarkIds);
          }}
          onRemoveEmptyLines={() => {
            const result = removeEmptyOutlineLines(document.sourceText);
            applyTextEdit(result.value);
            document.setStatusMessage(
              result.removedCount === 0
                ? "No empty lines were found."
                : `Removed ${result.removedCount} empty line${result.removedCount === 1 ? "" : "s"}.`,
              result.removedCount === 0 ? "warning" : "info",
            );
          }}
          onSplitPageTitle={() => {
            const result = splitTrailingPageNumbers(document.sourceText);
            applyTextEdit(result.value);
            document.setStatusMessage(
              result.transformedCount === 0
                ? "No lines had a clear trailing page number to split."
                : `Split title/page on ${result.transformedCount} line${result.transformedCount === 1 ? "" : "s"}.`,
              result.transformedCount === 0 ? "warning" : "info",
            );
          }}
          onAutoHierarchy={() => applyTextEdit(applyHierarchyFromNumbering(document.sourceText))}
          onApplyPageOffset={() => applyTextEdit(applyPageOffsetToOutlineText(document.sourceText, pageOffset))}
          onIndent={() => {
            if (document.editorMode === "text") {
              applyTextIndent("in");
              return;
            }
            document.indentSelected();
          }}
          onOutdent={() => {
            if (document.editorMode === "text") {
              applyTextIndent("out");
              return;
            }
            document.outdentSelected();
          }}
        />

        <main className="editor-workspace">
          {document.editorMode === "text" ? (
            <OutlineTextEditor
              value={document.sourceText}
              parseRows={document.parseRows}
              selectAllRequest={selectAllRequest}
              selectionRequest={selectionRequest}
              onChange={document.applySourceText}
              onSelectionChange={setTextSelection}
            />
          ) : (
            <BookmarkTree
              nodes={document.bookmarks}
              selectedNodeIds={document.selectedNodeIds}
              onSelectNodes={document.setSelectedNodeIds}
              onToggleNode={document.toggleNode}
              onIndentSelected={document.indentSelected}
              onOutdentSelected={document.outdentSelected}
            />
          )}
        </main>

        <StatusBar
          currentFileName={document.currentFileName}
          editorMode={document.editorMode}
          bookmarkCount={document.bookmarks.length}
          outlineLoadState={document.outlineLoadState}
          status={document.status}
        />
      </div>
    </div>
  );
};
