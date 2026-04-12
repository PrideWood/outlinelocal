import { BookmarkNode } from "./bookmarkTypes";
import {
  BookmarkPath,
  findBookmarkPath,
  getBookmarkNodeAtPath,
} from "./bookmarkTreeUtils";

const createDefaultBookmark = (id: string, title: string, pageIndex: number): BookmarkNode => ({
  id,
  title,
  pageIndex,
  children: [],
  isOpen: true,
});

const getSiblingsAtPath = (
  nodes: BookmarkNode[],
  parentPath: BookmarkPath,
): BookmarkNode[] | null => {
  if (parentPath.length === 0) {
    return nodes;
  }

  const parent = getBookmarkNodeAtPath(nodes, parentPath);
  return parent?.children ?? null;
};

const replaceNodeAtPath = (
  nodes: BookmarkNode[],
  path: BookmarkPath,
  replacement: BookmarkNode,
): BookmarkNode[] => {
  const [index, ...rest] = path;
  if (index === undefined) {
    return nodes;
  }

  return nodes.map((node, nodeIndex) => {
    if (nodeIndex !== index) {
      return node;
    }

    if (rest.length === 0) {
      return replacement;
    }

    return {
      ...node,
      children: replaceNodeAtPath(node.children, rest, replacement),
    };
  });
};

const replaceChildrenAtPath = (
  nodes: BookmarkNode[],
  parentPath: BookmarkPath,
  nextChildren: BookmarkNode[],
): BookmarkNode[] => {
  if (parentPath.length === 0) {
    return nextChildren;
  }

  const parent = getBookmarkNodeAtPath(nodes, parentPath);
  if (!parent) {
    return nodes;
  }

  return replaceNodeAtPath(nodes, parentPath, {
    ...parent,
    children: nextChildren,
  });
};

const insertAfter = (
  siblings: BookmarkNode[],
  index: number,
  node: BookmarkNode,
): BookmarkNode[] => [
  ...siblings.slice(0, index + 1),
  node,
  ...siblings.slice(index + 1),
];

const removeAt = (
  siblings: BookmarkNode[],
  index: number,
): BookmarkNode[] => [...siblings.slice(0, index), ...siblings.slice(index + 1)];

const swapAt = (
  siblings: BookmarkNode[],
  leftIndex: number,
  rightIndex: number,
): BookmarkNode[] => {
  const nextSiblings = [...siblings];
  const temporary = nextSiblings[leftIndex];
  nextSiblings[leftIndex] = nextSiblings[rightIndex];
  nextSiblings[rightIndex] = temporary;
  return nextSiblings;
};

export const renameNode = (
  nodes: BookmarkNode[],
  nodeId: string,
  title: string,
): BookmarkNode[] => {
  const path = findBookmarkPath(nodes, nodeId);
  const node = path ? getBookmarkNodeAtPath(nodes, path) : null;

  if (!path || !node) {
    return nodes;
  }

  return replaceNodeAtPath(nodes, path, {
    ...node,
    title,
  });
};

export const updateNodePage = (
  nodes: BookmarkNode[],
  nodeId: string,
  pageIndex: number,
): BookmarkNode[] => {
  const path = findBookmarkPath(nodes, nodeId);
  const node = path ? getBookmarkNodeAtPath(nodes, path) : null;

  if (!path || !node) {
    return nodes;
  }

  return replaceNodeAtPath(nodes, path, {
    ...node,
    pageIndex: Math.max(0, pageIndex),
  });
};

export const toggleNodeOpen = (
  nodes: BookmarkNode[],
  nodeId: string,
): BookmarkNode[] => {
  const path = findBookmarkPath(nodes, nodeId);
  const node = path ? getBookmarkNodeAtPath(nodes, path) : null;

  if (!path || !node) {
    return nodes;
  }

  return replaceNodeAtPath(nodes, path, {
    ...node,
    isOpen: !node.isOpen,
  });
};

export const addChild = (
  nodes: BookmarkNode[],
  nodeId: string,
  createId: () => string,
): { nodes: BookmarkNode[]; createdNodeId: string | null } => {
  const path = findBookmarkPath(nodes, nodeId);
  const node = path ? getBookmarkNodeAtPath(nodes, path) : null;

  if (!path || !node) {
    return { nodes, createdNodeId: null };
  }

  const newNodeId = createId();
  const nextNode = {
    ...node,
    isOpen: true,
    children: [
      ...node.children,
      createDefaultBookmark(newNodeId, "New child bookmark", node.pageIndex),
    ],
  };

  return {
    nodes: replaceNodeAtPath(nodes, path, nextNode),
    createdNodeId: newNodeId,
  };
};

export const addSibling = (
  nodes: BookmarkNode[],
  nodeId: string,
  createId: () => string,
): { nodes: BookmarkNode[]; createdNodeId: string | null } => {
  const path = findBookmarkPath(nodes, nodeId);
  if (!path) {
    return { nodes, createdNodeId: null };
  }

  const node = getBookmarkNodeAtPath(nodes, path);
  const parentPath = path.slice(0, -1);
  const siblings = getSiblingsAtPath(nodes, parentPath);
  const index = path[path.length - 1];

  if (!node || !siblings || index === undefined) {
    return { nodes, createdNodeId: null };
  }

  const newNodeId = createId();
  const newNode = createDefaultBookmark(newNodeId, "New sibling bookmark", node.pageIndex);

  return {
    nodes: replaceChildrenAtPath(nodes, parentPath, insertAfter(siblings, index, newNode)),
    createdNodeId: newNodeId,
  };
};

export const removeNode = (
  nodes: BookmarkNode[],
  nodeId: string,
): BookmarkNode[] => {
  const path = findBookmarkPath(nodes, nodeId);
  if (!path) {
    return nodes;
  }

  const parentPath = path.slice(0, -1);
  const siblings = getSiblingsAtPath(nodes, parentPath);
  const index = path[path.length - 1];

  if (!siblings || index === undefined) {
    return nodes;
  }

  return replaceChildrenAtPath(nodes, parentPath, removeAt(siblings, index));
};

export const moveNodeUp = (
  nodes: BookmarkNode[],
  nodeId: string,
): BookmarkNode[] => {
  const path = findBookmarkPath(nodes, nodeId);
  if (!path) {
    return nodes;
  }

  const parentPath = path.slice(0, -1);
  const siblings = getSiblingsAtPath(nodes, parentPath);
  const index = path[path.length - 1];

  if (!siblings || index === undefined || index === 0) {
    return nodes;
  }

  return replaceChildrenAtPath(nodes, parentPath, swapAt(siblings, index - 1, index));
};

export const moveNodeDown = (
  nodes: BookmarkNode[],
  nodeId: string,
): BookmarkNode[] => {
  const path = findBookmarkPath(nodes, nodeId);
  if (!path) {
    return nodes;
  }

  const parentPath = path.slice(0, -1);
  const siblings = getSiblingsAtPath(nodes, parentPath);
  const index = path[path.length - 1];

  if (!siblings || index === undefined || index >= siblings.length - 1) {
    return nodes;
  }

  return replaceChildrenAtPath(nodes, parentPath, swapAt(siblings, index, index + 1));
};

export const indentNode = (
  nodes: BookmarkNode[],
  nodeId: string,
): BookmarkNode[] => {
  const path = findBookmarkPath(nodes, nodeId);
  if (!path) {
    return nodes;
  }

  const parentPath = path.slice(0, -1);
  const siblings = getSiblingsAtPath(nodes, parentPath);
  const index = path[path.length - 1];

  if (!siblings || index === undefined || index === 0) {
    return nodes;
  }

  const node = siblings[index];
  const previousSibling = siblings[index - 1];
  const nextPreviousSibling: BookmarkNode = {
    ...previousSibling,
    isOpen: true,
    children: [...previousSibling.children, node],
  };

  const nextSiblings = [
    ...siblings.slice(0, index - 1),
    nextPreviousSibling,
    ...siblings.slice(index + 1),
  ];

  return replaceChildrenAtPath(nodes, parentPath, nextSiblings);
};

export const outdentNode = (
  nodes: BookmarkNode[],
  nodeId: string,
): BookmarkNode[] => {
  const path = findBookmarkPath(nodes, nodeId);
  if (!path || path.length < 2) {
    return nodes;
  }

  const parentPath = path.slice(0, -1);
  const grandParentPath = parentPath.slice(0, -1);
  const childIndex = path[path.length - 1];
  const parentIndex = parentPath[parentPath.length - 1];
  const parent = getBookmarkNodeAtPath(nodes, parentPath);
  const grandParentSiblings = getSiblingsAtPath(nodes, grandParentPath);

  if (!parent || childIndex === undefined || parentIndex === undefined || !grandParentSiblings) {
    return nodes;
  }

  const node = parent.children[childIndex];
  if (!node) {
    return nodes;
  }

  const siblingsBeforeNode = parent.children.slice(0, childIndex);
  const siblingsAfterNode = parent.children.slice(childIndex + 1);
  const nextParent: BookmarkNode = {
    ...parent,
    children: siblingsBeforeNode,
  };
  const promotedNode: BookmarkNode = {
    ...node,
    children: [...node.children, ...siblingsAfterNode],
    isOpen: siblingsAfterNode.length > 0 ? true : node.isOpen,
  };

  const nextGrandParentSiblings = [...grandParentSiblings];
  nextGrandParentSiblings[parentIndex] = nextParent;
  nextGrandParentSiblings.splice(parentIndex + 1, 0, promotedNode);

  return replaceChildrenAtPath(nodes, grandParentPath, nextGrandParentSiblings);
};
