import {
  EditorMode,
  OutlineLoadState,
  OutlineStatus,
} from "../../features/document/useOutlineDocument";

type StatusBarProps = {
  currentFileName: string | null;
  editorMode: EditorMode;
  bookmarkCount: number;
  outlineLoadState: OutlineLoadState;
  status: OutlineStatus;
};

export const StatusBar = ({
  currentFileName,
  editorMode,
  bookmarkCount,
  outlineLoadState,
  status,
}: StatusBarProps) => (
  <footer className="status-bar">
    <span>Container: {currentFileName ?? "sample outline only"}</span>
    <span>Mode: {editorMode === "text" ? "Text View" : "Tree View"}</span>
    <span>Root bookmarks: {bookmarkCount}</span>
    <span>Outline state: {outlineLoadState}</span>
    <span className={`status-bar__message status-bar__message--${status.tone}`}>{status.message}</span>
  </footer>
);
