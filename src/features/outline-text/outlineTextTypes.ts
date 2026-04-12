import { BookmarkNode } from "../bookmarks/bookmarkTypes";

export type ParsedOutlineRow = {
  raw: string;
  lineNumber: number;
  depth: number;
  title: string;
  pageNumber: number | null;
  error: string | null;
};

export type OutlineParseResult = {
  rows: ParsedOutlineRow[];
  bookmarks: BookmarkNode[] | null;
};
