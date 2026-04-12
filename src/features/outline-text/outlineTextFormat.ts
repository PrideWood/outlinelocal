import { BookmarkNode } from "../bookmarks/bookmarkTypes";
import { OutlineParseResult, ParsedOutlineRow } from "./outlineTextTypes";

const INDENT_UNIT = "  ";

const measureIndent = (value: string): number => {
  let width = 0;

  for (const character of value) {
    if (character === " ") {
      width += 1;
      continue;
    }

    if (character === "\t") {
      width += 2;
      continue;
    }

    break;
  }

  return width;
};

const collectIdsByPath = (
  nodes: BookmarkNode[],
  parentPath = "",
  output = new Map<string, string>(),
): Map<string, string> => {
  nodes.forEach((node, index) => {
    const path = parentPath === "" ? `${index}` : `${parentPath}.${index}`;
    output.set(path, node.id);
    collectIdsByPath(node.children, path, output);
  });

  return output;
};

const assignIdsByPath = (
  nodes: BookmarkNode[],
  existingIdByPath: Map<string, string>,
  createId: () => string,
  parentPath = "",
): BookmarkNode[] =>
  nodes.map((node, index) => {
    const path = parentPath === "" ? `${index}` : `${parentPath}.${index}`;
    return {
      ...node,
      id: existingIdByPath.get(path) ?? createId(),
      children: assignIdsByPath(node.children, existingIdByPath, createId, path),
    };
  });

const parseRow = (line: string, lineNumber: number): ParsedOutlineRow => {
  const indentWidth = measureIndent(line);
  const trimmedLine = line.trimEnd();
  const separatorIndex = trimmedLine.lastIndexOf("|");
  const depth = Math.floor(indentWidth / 2);

  if (indentWidth % 2 !== 0) {
    return {
      raw: line,
      lineNumber,
      depth,
      title: "",
      pageNumber: null,
      error: "Indentation must use multiples of two spaces.",
    };
  }

  if (separatorIndex === -1) {
    return {
      raw: line,
      lineNumber,
      depth,
      title: trimmedLine.trim(),
      pageNumber: null,
      error: "Missing `|` separator before the page number.",
    };
  }

  const title = trimmedLine.slice(0, separatorIndex).trim();
  const pageText = trimmedLine.slice(separatorIndex + 1).trim();

  if (title.length === 0) {
    return {
      raw: line,
      lineNumber,
      depth,
      title,
      pageNumber: null,
      error: "Bookmark title is required.",
    };
  }

  if (!/^\d+$/.test(pageText)) {
    return {
      raw: line,
      lineNumber,
      depth,
      title,
      pageNumber: null,
      error: "Page number must be an integer.",
    };
  }

  return {
    raw: line,
    lineNumber,
    depth,
    title,
    pageNumber: Number(pageText),
    error: null,
  };
};

export const serializeOutlineTree = (nodes: BookmarkNode[]): string => {
  const lines: string[] = [];

  const walk = (input: BookmarkNode[], depth: number) => {
    input.forEach((node) => {
      lines.push(`${INDENT_UNIT.repeat(depth)}${node.title} | ${node.pageIndex + 1}`);
      walk(node.children, depth + 1);
    });
  };

  walk(nodes, 0);
  return lines.join("\n");
};

export const parseOutlineText = (
  input: string,
  previousNodes: BookmarkNode[],
  createId: () => string,
): OutlineParseResult => {
  const rows = input
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ line, lineNumber }) => parseRow(line, lineNumber));

  const mutableRows = [...rows];
  const bookmarks: BookmarkNode[] = [];
  const nodeStack: BookmarkNode[] = [];

  for (const row of mutableRows) {
    if (row.error) {
      continue;
    }

    if (row.depth > nodeStack.length) {
      row.error = "Indentation jumps deeper than the previous line allows.";
      continue;
    }

    const node: BookmarkNode = {
      id: "",
      title: row.title,
      pageIndex: Math.max(0, (row.pageNumber ?? 1) - 1),
      children: [],
      isOpen: true,
    };

    if (row.depth === 0) {
      bookmarks.push(node);
    } else {
      const parent = nodeStack[row.depth - 1];
      if (!parent) {
        row.error = "No parent bookmark exists for this indentation level.";
        continue;
      }
      parent.children.push(node);
      parent.isOpen = true;
    }

    nodeStack[row.depth] = node;
    nodeStack.length = row.depth + 1;
  }

  const hasErrors = mutableRows.some((row) => row.error !== null);
  if (hasErrors) {
    return {
      rows: mutableRows,
      bookmarks: null,
    };
  }

  return {
    rows: mutableRows,
    bookmarks: assignIdsByPath(bookmarks, collectIdsByPath(previousNodes), createId),
  };
};
