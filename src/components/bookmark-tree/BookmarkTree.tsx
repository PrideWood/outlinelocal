import { type KeyboardEvent, type MouseEvent, useMemo, useRef, useState } from "react";
import { BookmarkNode } from "../../features/bookmarks/bookmarkTypes";
import { BookmarkTreeNodeRow } from "./BookmarkTreeNodeRow";

type VisibleBookmarkRow = {
  node: BookmarkNode;
  depth: number;
  ancestorContinuations: boolean[];
  hasNextSibling: boolean;
  hasOpenChildren: boolean;
};

type BookmarkTreeProps = {
  nodes: BookmarkNode[];
  selectedNodeIds: string[];
  onSelectNodes: (nodeIds: string[]) => void;
  onToggleNode: (nodeId: string) => void;
  onIndentSelected: () => void;
  onOutdentSelected: () => void;
};

const flattenVisibleRows = (
  nodes: BookmarkNode[],
  depth = 0,
  ancestorContinuations: boolean[] = [],
  rows: VisibleBookmarkRow[] = [],
): VisibleBookmarkRow[] => {
  nodes.forEach((node, index) => {
    const hasNextSibling = index < nodes.length - 1;
    const hasOpenChildren = node.isOpen === true && node.children.length > 0;
    rows.push({ node, depth, ancestorContinuations, hasNextSibling, hasOpenChildren });
    if (node.isOpen) {
      flattenVisibleRows(
        node.children,
        depth + 1,
        [...ancestorContinuations, hasNextSibling],
        rows,
      );
    }
  });

  return rows;
};

const getRangeSelection = (
  visibleNodeIds: string[],
  fromNodeId: string,
  toNodeId: string,
): string[] => {
  const fromIndex = visibleNodeIds.indexOf(fromNodeId);
  const toIndex = visibleNodeIds.indexOf(toNodeId);

  if (fromIndex === -1 || toIndex === -1) {
    return [toNodeId];
  }

  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  return visibleNodeIds.slice(start, end + 1);
};

const getTreeRowIdFromSelectionNode = (
  node: Node | null,
  treeElement: HTMLElement | null,
): string | null => {
  if (!node || !treeElement) {
    return null;
  }

  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const rowElement = element instanceof HTMLElement
    ? element.closest<HTMLElement>("[data-tree-row-id]")
    : null;

  if (!rowElement || !treeElement.contains(rowElement)) {
    return null;
  }

  return rowElement.dataset.treeRowId ?? null;
};

export const BookmarkTree = ({
  nodes,
  selectedNodeIds,
  onSelectNodes,
  onToggleNode,
  onIndentSelected,
  onOutdentSelected,
}: BookmarkTreeProps) => {
  const treeRef = useRef<HTMLDivElement>(null);
  const dragAnchorIdRef = useRef<string | null>(null);
  const visibleRows = useMemo(() => flattenVisibleRows(nodes), [nodes]);
  const visibleNodeIds = useMemo(
    () => visibleRows.map((row) => row.node.id),
    [visibleRows],
  );
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(
    selectedNodeIds[0] ?? null,
  );

  const selectRow = (
    nodeId: string,
    event: MouseEvent,
  ) => {
    treeRef.current?.focus({ preventScroll: true });

    if (event.shiftKey && selectionAnchorId) {
      onSelectNodes(getRangeSelection(visibleNodeIds, selectionAnchorId, nodeId));
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      const nextSelection = selectedNodeIds.includes(nodeId)
        ? selectedNodeIds.filter((selectedNodeId) => selectedNodeId !== nodeId)
        : [...selectedNodeIds, nodeId];
      onSelectNodes(nextSelection.length > 0 ? nextSelection : [nodeId]);
      setSelectionAnchorId(nodeId);
      return;
    }

    onSelectNodes([nodeId]);
    setSelectionAnchorId(nodeId);
    dragAnchorIdRef.current = nodeId;
  };

  const extendDragSelection = (nodeId: string, event: MouseEvent) => {
    if (dragAnchorIdRef.current === null || event.buttons !== 1) {
      return;
    }

    onSelectNodes(getRangeSelection(visibleNodeIds, dragAnchorIdRef.current, nodeId));
  };

  const syncSelectionFromBrowserRange = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }

    const anchorNodeId = getTreeRowIdFromSelectionNode(selection.anchorNode, treeRef.current);
    const focusNodeId = getTreeRowIdFromSelectionNode(selection.focusNode, treeRef.current);

    if (!anchorNodeId || !focusNodeId) {
      return;
    }

    onSelectNodes(getRangeSelection(visibleNodeIds, anchorNodeId, focusNodeId));
    setSelectionAnchorId(anchorNodeId);
  };

  const finishMouseSelection = () => {
    dragAnchorIdRef.current = null;
    window.requestAnimationFrame(syncSelectionFromBrowserRange);
  };

  const editHierarchyFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || selectedNodeIds.length === 0) {
      return;
    }

    event.preventDefault();

    if (event.shiftKey) {
      onOutdentSelected();
      return;
    }

    onIndentSelected();
  };

  return (
    <section className="editor-surface">
      <div className="editor-surface__header">
        <h2>Tree View</h2>
        <span>{visibleRows.length} visible rows. Shift-click selects ranges.</span>
      </div>

      <div
        ref={treeRef}
        className="tree-editor"
        role="tree"
        aria-label="Structural outline. Edit titles and pages in Text View."
        aria-multiselectable="true"
        tabIndex={0}
        onKeyDown={editHierarchyFromKeyboard}
        onMouseUp={finishMouseSelection}
      >
        {visibleRows.map((row) => (
          <BookmarkTreeNodeRow
            key={row.node.id}
            node={row.node}
            depth={row.depth}
            ancestorContinuations={row.ancestorContinuations}
            hasNextSibling={row.hasNextSibling}
            hasOpenChildren={row.hasOpenChildren}
            isSelected={selectedNodeIds.includes(row.node.id)}
            onSelectRow={selectRow}
            onExtendSelection={extendDragSelection}
            onToggleNode={onToggleNode}
          />
        ))}
      </div>
    </section>
  );
};
