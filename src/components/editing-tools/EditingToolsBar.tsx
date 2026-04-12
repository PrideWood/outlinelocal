import {
  Diff,
  FileSearchCorner,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Replace,
  ReplaceAll,
  SeparatorVertical,
  SquareDashedText,
} from "lucide-react";
import { EditorMode } from "../../features/document/useOutlineDocument";

const iconProps = {
  size: 17,
  strokeWidth: 1.9,
  "aria-hidden": true,
} as const;

type EditingToolsBarProps = {
  editorMode: EditorMode;
  findText: string;
  replacementText: string;
  pageOffset: number;
  onFindTextChange: (value: string) => void;
  onReplacementTextChange: (value: string) => void;
  onPageOffsetChange: (value: number) => void;
  onFind: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onSelectAll: () => void;
  onSplitPageTitle: () => void;
  onAutoHierarchy: () => void;
  onApplyPageOffset: () => void;
  onIndent: () => void;
  onOutdent: () => void;
};

export const EditingToolsBar = ({
  editorMode,
  findText,
  replacementText,
  pageOffset,
  onFindTextChange,
  onReplacementTextChange,
  onPageOffsetChange,
  onFind,
  onReplace,
  onReplaceAll,
  onSelectAll,
  onSplitPageTitle,
  onAutoHierarchy,
  onApplyPageOffset,
  onIndent,
  onOutdent,
}: EditingToolsBarProps) => (
  <section className="editing-tools-bar">
    <div className="editing-tools-bar__group">
      <span className="editing-tools-bar__mode">{editorMode === "text" ? "Text tools" : "Tree tools"}</span>
      <input
        aria-label="Find"
        placeholder="Find"
        value={findText}
        onChange={(event) => onFindTextChange(event.target.value)}
      />
      <input
        aria-label="Replace"
        placeholder="Replace"
        value={replacementText}
        onChange={(event) => onReplacementTextChange(event.target.value)}
      />
      <button
        className="icon-button"
        type="button"
        title="Find"
        aria-label="Find"
        onClick={onFind}
      >
        <FileSearchCorner {...iconProps} />
      </button>
      <button
        className="icon-button"
        type="button"
        title="Replace"
        aria-label="Replace"
        onClick={onReplace}
      >
        <Replace {...iconProps} />
      </button>
      <button
        className="icon-button"
        type="button"
        title="Replace All"
        aria-label="Replace All"
        onClick={onReplaceAll}
      >
        <ReplaceAll {...iconProps} />
      </button>
      <button
        className="icon-button"
        type="button"
        title="Select All"
        aria-label="Select All"
        onClick={onSelectAll}
      >
        <SquareDashedText {...iconProps} />
      </button>
    </div>

    <div className="editing-tools-bar__group">
      <button
        className="icon-button"
        type="button"
        title="Split Title/Page"
        aria-label="Split Title/Page"
        onClick={onSplitPageTitle}
      >
        <SeparatorVertical {...iconProps} />
      </button>
      <button
        className="icon-button"
        type="button"
        title="Auto hierarchy"
        aria-label="Auto hierarchy"
        onClick={onAutoHierarchy}
      >
        <ListOrdered {...iconProps} />
      </button>
      <input
        aria-label="Page offset"
        placeholder="Page offset"
        type="number"
        value={pageOffset}
        onChange={(event) => onPageOffsetChange(Number(event.target.value))}
      />
      <button
        className="icon-button"
        type="button"
        title="Apply offset"
        aria-label="Apply offset"
        onClick={onApplyPageOffset}
      >
        <Diff {...iconProps} />
      </button>
      <button
        className="icon-button"
        type="button"
        title="Indent"
        aria-label="Indent"
        onClick={onIndent}
      >
        <ListIndentIncrease {...iconProps} />
      </button>
      <button
        className="icon-button"
        type="button"
        title="Outdent"
        aria-label="Outdent"
        onClick={onOutdent}
      >
        <ListIndentDecrease {...iconProps} />
      </button>
    </div>
  </section>
);
