import { BookmarkNode } from "./bookmarkTypes";

export const mockBookmarks: BookmarkNode[] = [
  {
    id: "bookmark-1",
    title: "Cover",
    pageIndex: 0,
    isOpen: true,
    children: [],
  },
  {
    id: "bookmark-2",
    title: "Chapter 1",
    pageIndex: 2,
    isOpen: true,
    children: [
      {
        id: "bookmark-2-1",
        title: "Introduction",
        pageIndex: 3,
        isOpen: true,
        children: [],
      },
      {
        id: "bookmark-2-2",
        title: "Background",
        pageIndex: 5,
        isOpen: false,
        children: [
          {
            id: "bookmark-2-2-1",
            title: "Prior Work",
            pageIndex: 6,
            isOpen: true,
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: "bookmark-3",
    title: "Appendix",
    pageIndex: 20,
    isOpen: true,
    children: [],
  },
];
