export type BookmarkNode = {
  id: string;
  title: string;
  pageIndex: number;
  x?: number | null;
  y?: number | null;
  zoom?: number | null;
  children: BookmarkNode[];
  isOpen?: boolean;
  color?: string | null;
  bold?: boolean;
  italic?: boolean;
};

export type BookmarkSelection = {
  selectedNodeId: string | null;
};
