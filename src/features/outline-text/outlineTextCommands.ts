const INDENT = "  ";

type TextSelection = {
  start: number;
  end: number;
};

type TextEdit = {
  value: string;
  selection: TextSelection;
};

export type SplitPageTitleResult = {
  value: string;
  transformedCount: number;
};

const getSelectedLineRange = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
): TextSelection => {
  const adjustedEnd =
    selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nextLineBreak = value.indexOf("\n", adjustedEnd);

  return {
    start: lineStart,
    end: nextLineBreak === -1 ? value.length : nextLineBreak,
  };
};

const transformSelectedLines = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  transformLine: (line: string) => string,
): TextEdit => {
  const range = getSelectedLineRange(value, selectionStart, selectionEnd);
  const before = value.slice(0, range.start);
  const selectedText = value.slice(range.start, range.end);
  const after = value.slice(range.end);
  const lines = selectedText.split("\n");
  const transformedLines = lines.map(transformLine);
  const nextSelectedText = transformedLines.join("\n");
  const delta = nextSelectedText.length - selectedText.length;

  return {
    value: `${before}${nextSelectedText}${after}`,
    selection: {
      start: selectionStart + (transformedLines[0]?.length ?? 0) - (lines[0]?.length ?? 0),
      end: selectionEnd + delta,
    },
  };
};

export const indentSelectedOutlineLines = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
): TextEdit =>
  transformSelectedLines(value, selectionStart, selectionEnd, (line) =>
    line.trim().length === 0 ? line : `${INDENT}${line}`,
  );

export const outdentSelectedOutlineLines = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
): TextEdit =>
  transformSelectedLines(value, selectionStart, selectionEnd, (line) => {
    if (line.startsWith(INDENT)) {
      return line.slice(INDENT.length);
    }

    if (line.startsWith("\t")) {
      return line.slice(1);
    }

    if (line.startsWith(" ")) {
      return line.slice(1);
    }

    return line;
  });

const getNumberingDepth = (line: string): number | null => {
  const trimmed = line.trimStart();
  const match = trimmed.match(/^(\d+(?:\.\d+)*)(?:[\s.)-]+|$)/);

  if (!match) {
    return null;
  }

  return match[1].split(".").length - 1;
};

export const applyHierarchyFromNumbering = (value: string): string =>
  value
    .split("\n")
    .map((line) => {
      if (line.trim().length === 0) {
        return line;
      }

      const depth = getNumberingDepth(line);
      if (depth === null) {
        return line;
      }

      return `${INDENT.repeat(depth)}${line.trimStart()}`;
    })
    .join("\n");

export const applyPageOffsetToOutlineText = (
  value: string,
  offset: number,
): string =>
  value
    .split("\n")
    .map((line) => {
      const match = line.match(/^(.*\|\s*)(\d+)(\s*)$/);
      if (!match) {
        return line;
      }

      const nextPage = Math.max(1, Number(match[2]) + offset);
      return `${match[1]}${nextPage}${match[3]}`;
    })
    .join("\n");

const cleanTrailingLeaders = (value: string): string =>
  value
    .replace(/\s*(?:\.{2,}|。{2,}|…+|·{2,}|-{2,}|_{2,})\s*$/u, "")
    .trimEnd();

const hasTitleText = (value: string): boolean => /[^\d\s.．。…·_\-]/u.test(value);

export const splitTrailingPageNumbers = (value: string): SplitPageTitleResult => {
  let transformedCount = 0;
  const lines = value.split("\n").map((line) => {
    if (line.includes("|") || line.trim().length === 0) {
      return line;
    }

    const match = line.match(/^(\s*)(.*?)(\d+)\s*$/u);
    if (!match) {
      return line;
    }

    const leadingIndent = match[1];
    const title = cleanTrailingLeaders(match[2]);
    const pageNumber = match[3];

    if (!title || !hasTitleText(title)) {
      return line;
    }

    transformedCount += 1;
    return `${leadingIndent}${title} | ${pageNumber}`;
  });

  return {
    value: lines.join("\n"),
    transformedCount,
  };
};

export const splitPageTitleLines = (value: string): string =>
  splitTrailingPageNumbers(value).value;

export const replaceAllInText = (
  value: string,
  findText: string,
  replacement: string,
): string => {
  if (findText.length === 0) {
    return value;
  }

  return value.split(findText).join(replacement);
};
