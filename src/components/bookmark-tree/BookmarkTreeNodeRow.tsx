import { type MouseEvent } from "react";
import { BookmarkNode } from "../../features/bookmarks/bookmarkTypes";

type TreeTrackKind = "blank" | "ancestor" | "branch" | "branch-last" | "stem";

type BookmarkTreeNodeRowProps = {
  node: BookmarkNode;
  depth: number;
  ancestorContinuations: boolean[];
  hasNextSibling: boolean;
  hasOpenChildren: boolean;
  isSelected: boolean;
  onSelectRow: (nodeId: string, event: MouseEvent) => void;
  onExtendSelection: (nodeId: string, event: MouseEvent) => void;
  onToggleNode: (nodeId: string) => void;
};

const getTreeTracks = (
  depth: number,
  ancestorContinuations: boolean[],
  hasNextSibling: boolean,
  hasOpenChildren: boolean,
): TreeTrackKind[] => {
  const trackCount = Math.max(1, depth + 1);

  return Array.from({ length: trackCount }, (_, level) => {
    if (level < depth - 1) {
      return ancestorContinuations[level + 1] ? "ancestor" : "blank";
    }

    if (level === depth - 1 && depth > 0) {
      return hasNextSibling ? "branch" : "branch-last";
    }

    if (level === depth && hasOpenChildren) {
      return "stem";
    }

    return "blank";
  });
};

export const BookmarkTreeNodeRow = ({
  node,
  depth,
  ancestorContinuations,
  hasNextSibling,
  hasOpenChildren,
  isSelected,
  onSelectRow,
  onExtendSelection,
  onToggleNode,
}: BookmarkTreeNodeRowProps) => {
  const tracks = getTreeTracks(depth, ancestorContinuations, hasNextSibling, hasOpenChildren);
  const hasChildren = node.children.length > 0;

  return (
    <div
      className={`tree-row${isSelected ? " tree-row--selected" : ""}`}
      role="treeitem"
      data-tree-row-id={node.id}
      aria-selected={isSelected}
      aria-expanded={hasChildren ? node.isOpen : undefined}
      onMouseDown={(event) => onSelectRow(node.id, event)}
      onMouseEnter={(event) => onExtendSelection(node.id, event)}
    >
      <div className="tree-row__outline">
        <div
          className="tree-row__tracks"
          style={{ gridTemplateColumns: `repeat(${tracks.length}, 16px)` }}
        >
          {tracks.map((track, trackIndex) => {
            const isNodeTrack = trackIndex === depth;
            const showToggle = hasChildren && isNodeTrack;

            return (
              <span
                key={trackIndex}
                className={[
                  "tree-row__track",
                  `tree-row__track--${track}`,
                  showToggle ? "tree-row__track--with-toggle" : "",
                  showToggle && depth > 0 ? "tree-row__track--toggle-child" : "",
                ].filter(Boolean).join(" ")}
                aria-hidden={showToggle ? undefined : "true"}
              >
                {showToggle ? (
                  <button
                    className="tree-row__toggle"
                    type="button"
                    aria-label={node.isOpen ? "Collapse bookmark" : "Expand bookmark"}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => onToggleNode(node.id)}
                  >
                    {node.isOpen ? "−" : "+"}
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>

        <span
          className="tree-row__title"
          title={`${node.title} | ${node.pageIndex + 1}`}
        >
          {node.title || "Untitled bookmark"}
        </span>
      </div>
    </div>
  );
};
