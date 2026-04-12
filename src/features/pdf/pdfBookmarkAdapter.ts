import {
  GlobalWorkerOptions,
  getDocument,
  type PDFPageProxy,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { BookmarkNode } from "../bookmarks/bookmarkTypes";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfOutlineItem = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>> extends Array<infer T>
  ? T
  : never;

type PdfObjectRef = {
  objectNumber: number;
  generationNumber: number;
};

type RefLike = {
  num: number;
  gen: number;
};

type IndirectObject = {
  ref: PdfObjectRef;
  body: string;
};

export type PdfBookmarkReadDiagnostics = {
  pdfjsOutlineCount: number | null;
  fallbackOutlineCount: number | null;
  hasRawOutlinesMarker: boolean;
  usedFallback: boolean;
  warnings: string[];
};

export type PdfBookmarkReadResult = {
  bookmarks: BookmarkNode[];
  diagnostics: PdfBookmarkReadDiagnostics;
};

const isRefProxy = (value: unknown): value is RefLike =>
  typeof value === "object" &&
  value !== null &&
  "num" in value &&
  "gen" in value;

const toHexColor = (color: Uint8ClampedArray): string | null => {
  if (color.length !== 3) {
    return null;
  }

  return `#${Array.from(color)
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
};

const countBookmarks = (nodes: BookmarkNode[]): number =>
  nodes.reduce((total, node) => total + 1 + countBookmarks(node.children), 0);

const resolveDestination = async (
  documentProxy: PDFDocumentProxy,
  destination: PdfOutlineItem["dest"],
): Promise<number> => {
  let explicitDestination = destination;

  if (typeof explicitDestination === "string") {
    explicitDestination = await documentProxy.getDestination(explicitDestination);
  }

  if (!explicitDestination || !Array.isArray(explicitDestination) || explicitDestination.length === 0) {
    return 0;
  }

  const target = explicitDestination[0];

  if (typeof target === "number") {
    return Math.max(0, target);
  }

  if (isRefProxy(target)) {
    return await documentProxy.getPageIndex(target);
  }

  return 0;
};

const mapOutlineItems = async (
  documentProxy: PDFDocumentProxy,
  items: PdfOutlineItem[],
  createId: () => string,
): Promise<BookmarkNode[]> =>
  Promise.all(
    items.map(async (item) => ({
      id: createId(),
      title: item.title.trim() || "Untitled bookmark",
      pageIndex: await resolveDestination(documentProxy, item.dest),
      children: await mapOutlineItems(documentProxy, item.items, createId),
      isOpen: item.count === undefined ? true : item.count >= 0,
      color: toHexColor(item.color),
      bold: item.bold,
      italic: item.italic,
    })),
  );

const readLatin1 = (bytes: Uint8Array): string => {
  let result = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return result;
};

const parseObjectRef = (value: string | null): PdfObjectRef | null => {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d+)\s+(\d+)\s+R/);
  if (!match) {
    return null;
  }

  return {
    objectNumber: Number(match[1]),
    generationNumber: Number(match[2]),
  };
};

const refKey = (ref: PdfObjectRef): string => `${ref.objectNumber} ${ref.generationNumber}`;
const formatRef = (ref: PdfObjectRef): string => `${ref.objectNumber} ${ref.generationNumber} R`;

const parseIndirectObjects = (source: string): Map<string, string> => {
  const objects = new Map<string, string>();
  const objectPattern = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)\bendobj\b/g;
  let match: RegExpExecArray | null;

  while ((match = objectPattern.exec(source)) !== null) {
    objects.set(`${match[1]} ${match[2]}`, match[3]);
  }

  return objects;
};

const parseIndirectObjectEntries = (source: string): IndirectObject[] => {
  const objects: IndirectObject[] = [];
  const objectPattern = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)\bendobj\b/g;
  let match: RegExpExecArray | null;

  while ((match = objectPattern.exec(source)) !== null) {
    objects.push({
      ref: {
        objectNumber: Number(match[1]),
        generationNumber: Number(match[2]),
      },
      body: match[3].trim(),
    });
  }

  return objects;
};

const findDictionaryValue = (objectBody: string, key: string): string | null => {
  const match = objectBody.match(new RegExp(`/${key}\\s+([^\\n\\r<>\\[\\]/]+\\s+[^\\n\\r<>\\[\\]/]+\\s+R|\\[[\\s\\S]*?\\]|\\([^\\)]*\\)|<[^<>]*>|/[^\\s<>\\[\\]()]+)`));
  return match?.[1]?.trim() ?? null;
};

const findCatalog = (objects: Map<string, string>): string | null => {
  for (const body of objects.values()) {
    if (/\/Type\s*\/Catalog\b/.test(body)) {
      return body;
    }
  }

  return null;
};

const findCatalogObject = (objects: IndirectObject[]): IndirectObject | null =>
  objects.find((object) => /\/Type\s*\/Catalog\b/.test(object.body)) ?? null;

const decodeHexString = (hexString: string): string => {
  const normalized = hexString.replace(/\s/g, "");
  const bytes: number[] = [];

  for (let index = 0; index < normalized.length; index += 2) {
    bytes.push(Number.parseInt(normalized.slice(index, index + 2).padEnd(2, "0"), 16));
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let result = "";
    for (let index = 2; index < bytes.length; index += 2) {
      result += String.fromCharCode((bytes[index] << 8) + (bytes[index + 1] ?? 0));
    }
    return result;
  }

  return String.fromCharCode(...bytes);
};

const decodeLiteralString = (literal: string): string => {
  let result = "";

  for (let index = 0; index < literal.length; index += 1) {
    const character = literal[index];
    if (character !== "\\") {
      result += character;
      continue;
    }

    const next = literal[index + 1];
    index += 1;

    switch (next) {
      case "n":
        result += "\n";
        break;
      case "r":
        result += "\r";
        break;
      case "t":
        result += "\t";
        break;
      case "b":
        result += "\b";
        break;
      case "f":
        result += "\f";
        break;
      case "(":
      case ")":
      case "\\":
        result += next;
        break;
      default:
        result += next ?? "";
        break;
    }
  }

  return result;
};

const findPdfStringValue = (objectBody: string, key: string): string | null => {
  const keyIndex = objectBody.indexOf(`/${key}`);
  if (keyIndex === -1) {
    return null;
  }

  let index = keyIndex + key.length + 1;
  while (/\s/.test(objectBody[index] ?? "")) {
    index += 1;
  }

  if (objectBody[index] === "(") {
    let depth = 1;
    let value = "";
    index += 1;

    while (index < objectBody.length && depth > 0) {
      const character = objectBody[index];
      if (character === "\\") {
        value += character + (objectBody[index + 1] ?? "");
        index += 2;
        continue;
      }
      if (character === "(") {
        depth += 1;
      }
      if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
      value += character;
      index += 1;
    }

    return decodeLiteralString(value);
  }

  if (objectBody[index] === "<" && objectBody[index + 1] !== "<") {
    const endIndex = objectBody.indexOf(">", index + 1);
    if (endIndex === -1) {
      return null;
    }
    return decodeHexString(objectBody.slice(index + 1, endIndex));
  }

  return null;
};

const collectPageRefs = (
  objects: Map<string, string>,
  ref: PdfObjectRef | null,
  output: string[] = [],
  visited = new Set<string>(),
): string[] => {
  if (!ref || visited.has(refKey(ref))) {
    return output;
  }

  visited.add(refKey(ref));
  const body = objects.get(refKey(ref));
  if (!body) {
    return output;
  }

  if (/\/Type\s*\/Page\b/.test(body)) {
    output.push(refKey(ref));
    return output;
  }

  const kidsMatch = body.match(/\/Kids\s*\[([\s\S]*?)\]/);
  if (!kidsMatch) {
    return output;
  }

  const childRefs = [...kidsMatch[1].matchAll(/(\d+)\s+(\d+)\s+R/g)].map((match) => ({
    objectNumber: Number(match[1]),
    generationNumber: Number(match[2]),
  }));

  childRefs.forEach((childRef) => collectPageRefs(objects, childRef, output, visited));
  return output;
};

const resolveFallbackPageIndex = (
  objectBody: string,
  pageIndexByRef: Map<string, number>,
): number => {
  const destinationValue = findDictionaryValue(objectBody, "Dest");
  const actionMatch = objectBody.match(/\/A\s*<<([\s\S]*?)>>/);
  const actionDestination = actionMatch ? findDictionaryValue(actionMatch[1], "D") : null;
  const target = destinationValue ?? actionDestination;

  if (!target) {
    return 0;
  }

  const ref = parseObjectRef(target);
  if (ref) {
    return pageIndexByRef.get(refKey(ref)) ?? 0;
  }

  const numericPageMatch = target.match(/\[\s*(\d+)\b/);
  if (numericPageMatch) {
    return Math.max(0, Number(numericPageMatch[1]));
  }

  return 0;
};

const readFallbackOutlineItems = (
  objects: Map<string, string>,
  firstRef: PdfObjectRef | null,
  pageIndexByRef: Map<string, number>,
  createId: () => string,
  visited = new Set<string>(),
): BookmarkNode[] => {
  const nodes: BookmarkNode[] = [];
  let currentRef = firstRef;

  while (currentRef && !visited.has(refKey(currentRef))) {
    visited.add(refKey(currentRef));
    const body = objects.get(refKey(currentRef));
    if (!body) {
      break;
    }

    const title = findPdfStringValue(body, "Title")?.trim() || "Untitled bookmark";
    const childFirstRef = parseObjectRef(findDictionaryValue(body, "First"));
    nodes.push({
      id: createId(),
      title,
      pageIndex: resolveFallbackPageIndex(body, pageIndexByRef),
      children: readFallbackOutlineItems(objects, childFirstRef, pageIndexByRef, createId, visited),
      isOpen: true,
    });

    currentRef = parseObjectRef(findDictionaryValue(body, "Next"));
  }

  return nodes;
};

const readFallbackOutline = (
  bytes: Uint8Array,
  createId: () => string,
): { bookmarks: BookmarkNode[]; hasRawOutlinesMarker: boolean } => {
  const source = readLatin1(bytes);
  const hasRawOutlinesMarker = source.includes("/Outlines");
  const objects = parseIndirectObjects(source);
  const catalog = findCatalog(objects);
  const outlinesRef = parseObjectRef(catalog ? findDictionaryValue(catalog, "Outlines") : null);
  const pagesRef = parseObjectRef(catalog ? findDictionaryValue(catalog, "Pages") : null);
  const outlinesBody = outlinesRef ? objects.get(refKey(outlinesRef)) : null;
  const firstRef = outlinesBody ? parseObjectRef(findDictionaryValue(outlinesBody, "First")) : null;
  const pageRefs = collectPageRefs(objects, pagesRef);
  const pageIndexByRef = new Map(pageRefs.map((key, index) => [key, index]));

  return {
    bookmarks: readFallbackOutlineItems(objects, firstRef, pageIndexByRef, createId),
    hasRawOutlinesMarker,
  };
};

const findLastStartXref = (source: string): number => {
  const matches = [...source.matchAll(/startxref\s+(\d+)\s+%%EOF/g)];
  const lastMatch = matches.at(-1);

  if (!lastMatch) {
    throw new Error("Export failed because the PDF does not expose a classic startxref marker.");
  }

  return Number(lastMatch[1]);
};

const getMaxObjectNumber = (objects: IndirectObject[]): number =>
  objects.reduce((max, object) => Math.max(max, object.ref.objectNumber), 0);

const replaceOrAppendDictionaryRef = (
  dictionaryBody: string,
  key: string,
  ref: PdfObjectRef,
): string => {
  const nextValue = `/${key} ${formatRef(ref)}`;
  const keyPattern = new RegExp(`/${key}\\s+\\d+\\s+\\d+\\s+R`);

  if (keyPattern.test(dictionaryBody)) {
    return dictionaryBody.replace(keyPattern, nextValue);
  }

  const closeIndex = dictionaryBody.lastIndexOf(">>");
  if (closeIndex === -1) {
    throw new Error("Export failed because the PDF catalog dictionary could not be patched.");
  }

  return `${dictionaryBody.slice(0, closeIndex).trimEnd()}\n  ${nextValue}\n${dictionaryBody.slice(closeIndex)}`;
};

const toPdfUtf16HexString = (value: string): string => {
  const bytes = [0xfe, 0xff];

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    bytes.push((codeUnit >> 8) & 0xff, codeUnit & 0xff);
  }

  return `<${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}>`;
};

const countDescendants = (node: BookmarkNode): number =>
  node.children.reduce((total, child) => total + 1 + countDescendants(child), 0);

const countOutlineItems = (nodes: BookmarkNode[]): number =>
  nodes.reduce((total, node) => total + 1 + countOutlineItems(node.children), 0);

const readPageRefs = async (
  documentProxy: PDFDocumentProxy,
): Promise<PdfObjectRef[]> => {
  const refs: PdfObjectRef[] = [];

  for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
    const page = await documentProxy.getPage(pageNumber);
    const maybeRef = (page as PDFPageProxy & { ref?: unknown }).ref;

    if (!isRefProxy(maybeRef)) {
      throw new Error("Export failed because PDF.js did not expose page object references for this file.");
    }

    refs.push({
      objectNumber: maybeRef.num,
      generationNumber: maybeRef.gen,
    });
  }

  return refs;
};

const clampPageIndex = (pageIndex: number, pageCount: number): number => {
  if (pageCount === 0) {
    return 0;
  }

  return Math.min(Math.max(0, pageIndex), pageCount - 1);
};

const buildOutlineItemObjects = (
  nodes: BookmarkNode[],
  parentRef: PdfObjectRef,
  pageRefs: PdfObjectRef[],
  nextObjectNumber: { value: number },
): { firstRef: PdfObjectRef | null; lastRef: PdfObjectRef | null; objects: IndirectObject[] } => {
  const itemRefs = nodes.map(() => ({
    objectNumber: nextObjectNumber.value += 1,
    generationNumber: 0,
  }));
  const objects: IndirectObject[] = [];

  nodes.forEach((node, index) => {
    const itemRef = itemRefs[index];
    const childObjects = buildOutlineItemObjects(node.children, itemRef, pageRefs, nextObjectNumber);
    const pageRef = pageRefs[clampPageIndex(node.pageIndex, pageRefs.length)];
    const entries = [
      `/Title ${toPdfUtf16HexString(node.title || "Untitled bookmark")}`,
      `/Parent ${formatRef(parentRef)}`,
      pageRef ? `/Dest [${formatRef(pageRef)} /Fit]` : null,
      index > 0 ? `/Prev ${formatRef(itemRefs[index - 1])}` : null,
      index < itemRefs.length - 1 ? `/Next ${formatRef(itemRefs[index + 1])}` : null,
      childObjects.firstRef ? `/First ${formatRef(childObjects.firstRef)}` : null,
      childObjects.lastRef ? `/Last ${formatRef(childObjects.lastRef)}` : null,
      childObjects.firstRef
        ? `/Count ${(node.isOpen === false ? -1 : 1) * countDescendants(node)}`
        : null,
    ].filter((entry): entry is string => Boolean(entry));

    objects.push({
      ref: itemRef,
      body: `<<\n  ${entries.join("\n  ")}\n>>`,
    });
    objects.push(...childObjects.objects);
  });

  return {
    firstRef: itemRefs[0] ?? null,
    lastRef: itemRefs.at(-1) ?? null,
    objects,
  };
};

const buildOutlineObjects = (
  bookmarks: BookmarkNode[],
  pageRefs: PdfObjectRef[],
  firstObjectNumber: number,
): IndirectObject[] => {
  const outlineRootRef = {
    objectNumber: firstObjectNumber,
    generationNumber: 0,
  };
  const nextObjectNumber = { value: firstObjectNumber };
  const itemObjects = buildOutlineItemObjects(bookmarks, outlineRootRef, pageRefs, nextObjectNumber);
  const rootEntries = [
    "/Type /Outlines",
    itemObjects.firstRef ? `/First ${formatRef(itemObjects.firstRef)}` : null,
    itemObjects.lastRef ? `/Last ${formatRef(itemObjects.lastRef)}` : null,
    `/Count ${countOutlineItems(bookmarks)}`,
  ].filter((entry): entry is string => Boolean(entry));

  return [
    {
      ref: outlineRootRef,
      body: `<<\n  ${rootEntries.join("\n  ")}\n>>`,
    },
    ...itemObjects.objects,
  ];
};

const appendIncrementalUpdate = (
  originalBytes: Uint8Array,
  objects: IndirectObject[],
  previousStartXref: number,
  rootRef: PdfObjectRef,
): Blob => {
  const encoder = new TextEncoder();
  const toArrayBuffer = (value: Uint8Array): ArrayBuffer => {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return copy.buffer;
  };
  const sortedObjects = [...objects].sort((left, right) => left.ref.objectNumber - right.ref.objectNumber);
  let appended = "\n";
  const entries = sortedObjects.map((object) => {
    const offset = originalBytes.length + encoder.encode(appended).length;
    appended += `${object.ref.objectNumber} ${object.ref.generationNumber} obj\n${object.body}\nendobj\n`;
    return { ref: object.ref, offset };
  });
  const xrefOffset = originalBytes.length + encoder.encode(appended).length;
  const maxObjectNumber = Math.max(...sortedObjects.map((object) => object.ref.objectNumber));

  appended += "xref\n";

  for (let index = 0; index < entries.length;) {
    const startObjectNumber = entries[index].ref.objectNumber;
    const sectionEntries = [entries[index]];
    index += 1;

    while (
      index < entries.length &&
      entries[index].ref.objectNumber === sectionEntries[sectionEntries.length - 1].ref.objectNumber + 1
    ) {
      sectionEntries.push(entries[index]);
      index += 1;
    }

    appended += `${startObjectNumber} ${sectionEntries.length}\n`;
    appended += sectionEntries
      .map((entry) => `${String(entry.offset).padStart(10, "0")} ${String(entry.ref.generationNumber).padStart(5, "0")} n \n`)
      .join("");
  }

  appended += `trailer\n<<\n  /Size ${maxObjectNumber + 1}\n  /Root ${formatRef(rootRef)}\n  /Prev ${previousStartXref}\n>>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const appendedBytes = encoder.encode(appended);

  return new Blob([toArrayBuffer(originalBytes), toArrayBuffer(appendedBytes)], { type: "application/pdf" });
};

export type PdfBookmarkAdapter = {
  readBookmarks(file: File): Promise<PdfBookmarkReadResult>;
  writeBookmarks(file: File, bookmarks: BookmarkNode[]): Promise<Blob>;
};

export const createPdfBookmarkAdapter = (): PdfBookmarkAdapter => {
  let counter = 0;
  const createId = () => `pdf-bookmark-${counter += 1}`;

  return {
    async readBookmarks(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const diagnostics: PdfBookmarkReadDiagnostics = {
        pdfjsOutlineCount: null,
        fallbackOutlineCount: null,
        hasRawOutlinesMarker: false,
        usedFallback: false,
        warnings: [],
      };
      const loadingTask = getDocument(bytes.slice());

      const documentProxy = await loadingTask.promise;

      try {
        const outline = await documentProxy.getOutline();
        diagnostics.pdfjsOutlineCount = outline?.length ?? 0;

        if (!outline || outline.length === 0) {
          const fallback = readFallbackOutline(bytes, createId);
          diagnostics.fallbackOutlineCount = countBookmarks(fallback.bookmarks);
          diagnostics.hasRawOutlinesMarker = fallback.hasRawOutlinesMarker;
          diagnostics.usedFallback = fallback.bookmarks.length > 0;

          if (fallback.hasRawOutlinesMarker && fallback.bookmarks.length === 0) {
            diagnostics.warnings.push(
              "The raw PDF contains an /Outlines marker, but no readable outline items were returned.",
            );
          }

          return {
            bookmarks: fallback.bookmarks,
            diagnostics,
          };
        }

        const bookmarks = await mapOutlineItems(documentProxy, outline, createId);
        diagnostics.fallbackOutlineCount = null;

        return {
          bookmarks,
          diagnostics,
        };
      } finally {
        await documentProxy.destroy();
      }
    },
    async writeBookmarks(file, bookmarks) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const source = readLatin1(bytes);
      const objectEntries = parseIndirectObjectEntries(source);
      const catalogObject = findCatalogObject(objectEntries);

      if (!catalogObject) {
        throw new Error("Export failed because the PDF catalog object could not be found.");
      }

      const previousStartXref = findLastStartXref(source);
      const loadingTask = getDocument(bytes.slice());
      const documentProxy = await loadingTask.promise;

      try {
        const pageRefs = await readPageRefs(documentProxy);
        const firstNewObjectNumber = getMaxObjectNumber(objectEntries) + 1;
        const outlineObjects = buildOutlineObjects(bookmarks, pageRefs, firstNewObjectNumber);
        const patchedCatalog: IndirectObject = {
          ref: catalogObject.ref,
          body: replaceOrAppendDictionaryRef(catalogObject.body, "Outlines", outlineObjects[0].ref),
        };

        return appendIncrementalUpdate(
          bytes,
          [patchedCatalog, ...outlineObjects],
          previousStartXref,
          catalogObject.ref,
        );
      } finally {
        await documentProxy.destroy();
      }
    },
  };
};
