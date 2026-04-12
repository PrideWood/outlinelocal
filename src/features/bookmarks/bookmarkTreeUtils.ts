import { BookmarkNode } from "./bookmarkTypes";

export type BookmarkPath = number[];

export const findBookmarkNode = (
  nodes: BookmarkNode[],
  targetNodeId: string | null,
): BookmarkNode | null => {
  if (targetNodeId === null) {
    return null;
  }

  for (const node of nodes) {
    if (node.id === targetNodeId) {
      return node;
    }

    const nestedMatch = findBookmarkNode(node.children, targetNodeId);
    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return null;
};

export const hasBookmarkNode = (
  nodes: BookmarkNode[],
  targetNodeId: string | null,
): boolean => findBookmarkNode(nodes, targetNodeId) !== null;

export const findBookmarkPath = (
  nodes: BookmarkNode[],
  targetNodeId: string,
  parentPath: BookmarkPath = [],
): BookmarkPath | null => {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const currentPath = [...parentPath, index];

    if (node.id === targetNodeId) {
      return currentPath;
    }

    const nestedPath = findBookmarkPath(node.children, targetNodeId, currentPath);
    if (nestedPath) {
      return nestedPath;
    }
  }

  return null;
};

export const getBookmarkNodeAtPath = (
  nodes: BookmarkNode[],
  path: BookmarkPath,
): BookmarkNode | null => {
  let currentNodes = nodes;
  let currentNode: BookmarkNode | null = null;

  for (const index of path) {
    currentNode = currentNodes[index] ?? null;
    if (!currentNode) {
      return null;
    }
    currentNodes = currentNode.children;
  }

  return currentNode;
};
