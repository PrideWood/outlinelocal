import { useMemo, useRef, useState } from "react";
import {
  addChild,
  addSibling,
  indentNode,
  moveNodeDown,
  moveNodeUp,
  outdentNode,
  removeNode,
  renameNode,
  toggleNodeOpen,
  updateNodePage,
} from "../bookmarks/bookmarkCommands";
import { findBookmarkNode, hasBookmarkNode } from "../bookmarks/bookmarkTreeUtils";
import { mockBookmarks } from "../bookmarks/mockBookmarks";
import { BookmarkNode } from "../bookmarks/bookmarkTypes";
import { parseOutlineText, serializeOutlineTree } from "../outline-text/outlineTextFormat";
import { ParsedOutlineRow } from "../outline-text/outlineTextTypes";
import { createPdfBookmarkAdapter } from "../pdf/pdfBookmarkAdapter";
import { createEditedPdfFileName, downloadBlob } from "../../services/file/saveFile";

export type EditorMode = "text" | "tree";
export type OutlineLoadState = "mock" | "loading" | "loaded" | "empty" | "error";

type StatusTone = "info" | "warning" | "error";

export type OutlineStatus = {
  message: string;
  tone: StatusTone;
};

type DocumentSnapshot = {
  bookmarks: BookmarkNode[];
  sourceText: string;
  parseRows: ParsedOutlineRow[];
  selectedNodeIds: string[];
};

type DocumentHistory = {
  past: DocumentSnapshot[];
  future: DocumentSnapshot[];
};

const createBookmarkIdFactory = () => {
  let counter = 1000;
  return () => `bookmark-${counter += 1}`;
};

const fallbackSelection = (nodes: BookmarkNode[]): string | null => nodes[0]?.id ?? null;
const countBookmarks = (nodes: BookmarkNode[]): number =>
  nodes.reduce((total, node) => total + 1 + countBookmarks(node.children), 0);
const flattenBookmarkIds = (nodes: BookmarkNode[]): string[] =>
  nodes.flatMap((node) => [node.id, ...flattenBookmarkIds(node.children)]);

export const useOutlineDocument = () => {
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>(mockBookmarks);
  const initialSelection = fallbackSelection(mockBookmarks);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(
    initialSelection ? [initialSelection] : [],
  );
  const [editorMode, setEditorMode] = useState<EditorMode>("text");
  const [sourceText, setSourceText] = useState<string>(serializeOutlineTree(mockBookmarks));
  const [parseRows, setParseRows] = useState<ParsedOutlineRow[]>([]);
  const [history, setHistory] = useState<DocumentHistory>({ past: [], future: [] });
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [currentPdfFile, setCurrentPdfFile] = useState<File | null>(null);
  const [outlineLoadState, setOutlineLoadState] = useState<OutlineLoadState>("mock");
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<OutlineStatus>({
    message: "Editing sample outline data. PDF outline read/write remains behind a placeholder adapter.",
    tone: "warning",
  });
  const createId = useMemo(() => createBookmarkIdFactory(), []);
  const pdfBookmarkAdapter = useMemo(() => createPdfBookmarkAdapter(), []);
  const loadRequestRef = useRef(0);
  const selectedNodeId = selectedNodeIds[0] ?? null;
  const selectedNode = useMemo(
    () => findBookmarkNode(bookmarks, selectedNodeId),
    [bookmarks, selectedNodeId],
  );

  const getSnapshot = (): DocumentSnapshot => ({
    bookmarks,
    sourceText,
    parseRows,
    selectedNodeIds,
  });

  const applySnapshot = (snapshot: DocumentSnapshot) => {
    setBookmarks(snapshot.bookmarks);
    setSourceText(snapshot.sourceText);
    setParseRows(snapshot.parseRows);
    setSelectedNodeIds(snapshot.selectedNodeIds);
  };

  const recordHistory = () => {
    const snapshot = getSnapshot();
    setHistory((current) => ({
      past: [...current.past, snapshot],
      future: [],
    }));
  };

  const clearHistory = () => {
    setHistory({ past: [], future: [] });
  };

  const getActiveNodeIds = (): string[] => {
    const selectedNodeIdSet = new Set(selectedNodeIds);
    return flattenBookmarkIds(bookmarks).filter((nodeId) => selectedNodeIdSet.has(nodeId));
  };

  const syncTree = (
    nextBookmarks: BookmarkNode[],
    nextSelectedNodeId?: string | null,
    options: { recordHistory?: boolean } = {},
  ) => {
    if (options.recordHistory !== false) {
      recordHistory();
    }

    setBookmarks(nextBookmarks);
    setSourceText(serializeOutlineTree(nextBookmarks));
    setParseRows([]);
    if (nextSelectedNodeId !== undefined) {
      setSelectedNodeIds(nextSelectedNodeId ? [nextSelectedNodeId] : []);
      return;
    }

    const stillSelectedIds = selectedNodeIds.filter((nodeId) => hasBookmarkNode(nextBookmarks, nodeId));
    const fallbackNodeId = fallbackSelection(nextBookmarks);
    setSelectedNodeIds(stillSelectedIds.length > 0 ? stillSelectedIds : fallbackNodeId ? [fallbackNodeId] : []);
  };

  const applySourceText = (nextText: string, options: { recordHistory?: boolean } = {}) => {
    if (nextText === sourceText) {
      return;
    }

    if (options.recordHistory !== false) {
      recordHistory();
    }

    setSourceText(nextText);
    const result = parseOutlineText(nextText, bookmarks, createId);
    setParseRows(result.rows);

    if (result.bookmarks) {
      setBookmarks(result.bookmarks);
      setSelectedNodeIds((current) => {
        const stillSelected = current.filter((nodeId) => hasBookmarkNode(result.bookmarks!, nodeId));
        const fallbackNodeId = fallbackSelection(result.bookmarks!);
        return stillSelected.length > 0 ? stillSelected : fallbackNodeId ? [fallbackNodeId] : [];
      });
      setStatus({
        message: `Parsed ${result.rows.length} outline row${result.rows.length === 1 ? "" : "s"} successfully.`,
        tone: "info",
      });
      return;
    }

    const errorCount = result.rows.filter((row) => row.error !== null).length;
    setStatus({
      message: `${errorCount} outline line${errorCount === 1 ? "" : "s"} need attention before the tree can update.`,
      tone: "error",
    });
  };

  return {
    bookmarks,
    selectedNodeId,
    selectedNodeIds,
    selectedNode,
    editorMode,
    sourceText,
    parseRows,
    currentFileName,
    outlineLoadState,
    isExporting,
    status,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    setStatusMessage(message: string, tone: StatusTone = "info") {
      setStatus({ message, tone });
    },
    setEditorMode,
    setSelectedNodeId(nodeId: string | null) {
      setSelectedNodeIds(nodeId ? [nodeId] : []);
    },
    setSelectedNodeIds,
    async openPdfFile(file: File | null) {
      if (!file) {
        return;
      }

      const requestId = ++loadRequestRef.current;
      setCurrentFileName(file.name);
      setCurrentPdfFile(file);
      setOutlineLoadState("loading");
      setStatus({
        message: `Reading outline data from ${file.name}...`,
        tone: "info",
      });

      try {
        const readResult = await pdfBookmarkAdapter.readBookmarks(file);
        const extractedBookmarks = readResult.bookmarks;
        if (requestId !== loadRequestRef.current) {
          return;
        }

        setEditorMode("text");

        if (extractedBookmarks.length === 0) {
          syncTree([], null, { recordHistory: false });
          clearHistory();
          setOutlineLoadState("empty");
          setStatus({
            message: readResult.diagnostics.hasRawOutlinesMarker
              ? `${file.name} contains an /Outlines marker, but no readable outline items were extracted. ${readResult.diagnostics.warnings.join(" ")}`
              : `${file.name} does not contain any PDF outline entries readable through the current adapter.`,
            tone: readResult.diagnostics.hasRawOutlinesMarker ? "error" : "warning",
          });
          return;
        }

        syncTree(extractedBookmarks, fallbackSelection(extractedBookmarks), { recordHistory: false });
        clearHistory();
        setOutlineLoadState("loaded");
        setStatus({
          message: `Loaded ${countBookmarks(extractedBookmarks)} outline entries from ${file.name}${readResult.diagnostics.usedFallback ? " using the raw /Outlines fallback." : "."}`,
          tone: "info",
        });
      } catch (error) {
        if (requestId !== loadRequestRef.current) {
          return;
        }

        syncTree([], null, { recordHistory: false });
        clearHistory();
        setOutlineLoadState("error");
        setStatus({
          message:
            error instanceof Error
              ? `Outline extraction failed: ${error.message}`
              : "Outline extraction failed for the selected PDF.",
          tone: "error",
        });
      }
    },
    importOutlineText(file: File | null) {
      if (!file) {
        return;
      }

      void file.text().then((text) => {
        setEditorMode("text");
        applySourceText(text);
      }).catch(() => {
        setStatus({
          message: `Could not read ${file.name} as outline text.`,
          tone: "error",
        });
      });
    },
    async exportPdf() {
      if (!currentPdfFile) {
        setStatus({
          message: "Open a local PDF before exporting an edited PDF.",
          tone: "warning",
        });
        return;
      }

      if (isExporting) {
        return;
      }

      setIsExporting(true);
      setStatus({
        message: `Exporting ${createEditedPdfFileName(currentFileName)}...`,
        tone: "info",
      });

      try {
        const blob = await pdfBookmarkAdapter.writeBookmarks(currentPdfFile, bookmarks);
        downloadBlob(blob, createEditedPdfFileName(currentFileName));
        setStatus({
          message: `Exported ${countBookmarks(bookmarks)} outline entries to ${createEditedPdfFileName(currentFileName)}.`,
          tone: "info",
        });
      } catch (error) {
        setStatus({
          message:
            error instanceof Error
              ? error.message
              : "PDF export failed before a downloadable file could be created.",
          tone: "error",
        });
      } finally {
        setIsExporting(false);
      }
    },
    undo() {
      const previous = history.past[history.past.length - 1];
      if (!previous) {
        return;
      }

      const currentSnapshot = getSnapshot();
      applySnapshot(previous);
      setHistory({
        past: history.past.slice(0, -1),
        future: [currentSnapshot, ...history.future],
      });
      setStatus({
        message: "Undid the previous outline edit.",
        tone: "info",
      });
    },
    redo() {
      const next = history.future[0];
      if (!next) {
        return;
      }

      const currentSnapshot = getSnapshot();
      applySnapshot(next);
      setHistory({
        past: [...history.past, currentSnapshot],
        future: history.future.slice(1),
      });
      setStatus({
        message: "Redid the outline edit.",
        tone: "info",
      });
    },
    exportOutlineText() {
      const blob = new Blob([sourceText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = (currentFileName ?? "outline").replace(/\.pdf$/i, "") + ".outline.txt";
      link.click();
      URL.revokeObjectURL(url);
      setStatus({
        message: "Exported the current outline text locally.",
        tone: "info",
      });
    },
    applySourceText,
    renameSelectedNode(title: string) {
      if (!selectedNodeId) {
        return;
      }
      syncTree(renameNode(bookmarks, selectedNodeId, title));
    },
    updateSelectedPage(pageNumber: number) {
      if (!selectedNodeId || !Number.isFinite(pageNumber)) {
        return;
      }
      syncTree(updateNodePage(bookmarks, selectedNodeId, pageNumber - 1));
    },
    toggleSelectedNode() {
      if (!selectedNodeId) {
        return;
      }
      syncTree(toggleNodeOpen(bookmarks, selectedNodeId), undefined, { recordHistory: false });
    },
    addSibling() {
      if (!selectedNodeId) {
        return;
      }
      const result = addSibling(bookmarks, selectedNodeId, createId);
      syncTree(result.nodes, result.createdNodeId);
    },
    addChild() {
      if (!selectedNodeId) {
        return;
      }
      const result = addChild(bookmarks, selectedNodeId, createId);
      syncTree(result.nodes, result.createdNodeId);
    },
    deleteSelected() {
      const activeNodeIds = getActiveNodeIds();
      if (activeNodeIds.length === 0) {
        return;
      }

      const nextBookmarks = activeNodeIds.reduce(
        (currentBookmarks, nodeId) => removeNode(currentBookmarks, nodeId),
        bookmarks,
      );
      syncTree(nextBookmarks, null);
    },
    moveSelectedUp() {
      const activeNodeIds = getActiveNodeIds();
      if (activeNodeIds.length === 0) {
        return;
      }

      syncTree(
        activeNodeIds.reduce(
          (currentBookmarks, nodeId) => moveNodeUp(currentBookmarks, nodeId),
          bookmarks,
        ),
      );
    },
    moveSelectedDown() {
      const activeNodeIds = getActiveNodeIds();
      if (activeNodeIds.length === 0) {
        return;
      }

      syncTree(
        [...activeNodeIds].reverse().reduce(
          (currentBookmarks, nodeId) => moveNodeDown(currentBookmarks, nodeId),
          bookmarks,
        ),
      );
    },
    indentSelected() {
      const activeNodeIds = getActiveNodeIds();
      if (activeNodeIds.length === 0) {
        return;
      }

      syncTree(
        activeNodeIds.reduce(
          (currentBookmarks, nodeId) => indentNode(currentBookmarks, nodeId),
          bookmarks,
        ),
      );
    },
    outdentSelected() {
      const activeNodeIds = getActiveNodeIds();
      if (activeNodeIds.length === 0) {
        return;
      }

      syncTree(
        activeNodeIds.reduce(
          (currentBookmarks, nodeId) => outdentNode(currentBookmarks, nodeId),
          bookmarks,
        ),
      );
    },
    updateNodeTitle(nodeId: string, title: string) {
      syncTree(renameNode(bookmarks, nodeId, title));
    },
    updateNodePageNumber(nodeId: string, pageNumber: number) {
      syncTree(updateNodePage(bookmarks, nodeId, pageNumber - 1));
    },
    toggleNode(nodeId: string) {
      syncTree(toggleNodeOpen(bookmarks, nodeId), undefined, { recordHistory: false });
    },
  };
};
