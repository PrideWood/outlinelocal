import {
  GlobalWorkerOptions,
  getDocument,
  type PDFPageProxy,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { BookmarkNode } from "../bookmarks/bookmarkTypes";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const RAW_FALLBACK_MAX_BYTES = 64 * 1024 * 1024;
const STARTXREF_SCAN_BYTES = 256 * 1024;
const XREF_SECTION_INITIAL_SCAN_BYTES = 256 * 1024;
const XREF_SECTION_MAX_SCAN_BYTES = 32 * 1024 * 1024;
const INDIRECT_OBJECT_INITIAL_SCAN_BYTES = 32 * 1024;
const INDIRECT_OBJECT_MAX_SCAN_BYTES = 1024 * 1024;

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

type XrefEntry = {
  offset: number;
  generationNumber: number;
  inUse: boolean;
};

type ClassicXrefSection = {
  entries: Map<string, XrefEntry>;
  rootRef: PdfObjectRef | null;
  prev: number | null;
  size: number | null;
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

const formatBytes = (byteLength: number): string => {
  if (byteLength < 1024 * 1024) {
    return `${Math.max(1, Math.round(byteLength / 1024))} KB`;
  }

  return `${(byteLength / (1024 * 1024)).toFixed(byteLength >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
};

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

const readLatin1 = (bytes: Uint8Array): string => new TextDecoder("latin1").decode(bytes);

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

const findDictionaryValue = (objectBody: string, key: string): string | null => {
  const match = objectBody.match(
    new RegExp(
      `/${key}\\s+([^\\n\\r<>\\[\\]/]+\\s+[^\\n\\r<>\\[\\]/]+\\s+R|\\[[\\s\\S]*?\\]|\\([^\\)]*\\)|<[^<>]*>|-?\\d+(?:\\.\\d+)?|true|false|null|/[^\\s<>\\[\\]()]+)`,
    ),
  );
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

const readBlobBytes = async (
  blob: Blob,
  start: number,
  end: number,
): Promise<Uint8Array> => new Uint8Array(await blob.slice(start, end).arrayBuffer());

const readBlobLatin1 = async (
  blob: Blob,
  start: number,
  end: number,
): Promise<string> => readLatin1(await readBlobBytes(blob, start, end));

const extractDictionaryBlock = (
  source: string,
  searchStartIndex: number,
): string | null => {
  const startIndex = source.indexOf("<<", searchStartIndex);
  if (startIndex === -1) {
    return null;
  }

  let depth = 0;

  for (let index = startIndex; index < source.length - 1; index += 1) {
    const pair = source.slice(index, index + 2);
    if (pair === "<<") {
      depth += 1;
      index += 1;
      continue;
    }

    if (pair === ">>") {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

const parseClassicXrefEntries = (source: string): Map<string, XrefEntry> => {
  const entries = new Map<string, XrefEntry>();
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length;) {
    const subsectionMatch = lines[index].match(/^(\d+)\s+(\d+)$/);
    if (!subsectionMatch) {
      throw new Error("Export failed because a classic xref subsection header could not be parsed.");
    }

    const startObjectNumber = Number(subsectionMatch[1]);
    const count = Number(subsectionMatch[2]);
    index += 1;

    for (let entryIndex = 0; entryIndex < count; entryIndex += 1, index += 1) {
      const entryLine = lines[index];
      if (!entryLine) {
        throw new Error("Export failed because a classic xref entry was truncated.");
      }

      const entryMatch = entryLine.match(/^(\d{10})\s+(\d{5})\s+([nf])$/);
      if (!entryMatch) {
        throw new Error("Export failed because a classic xref entry could not be parsed.");
      }

      const ref = {
        objectNumber: startObjectNumber + entryIndex,
        generationNumber: Number(entryMatch[2]),
      };

      entries.set(refKey(ref), {
        offset: Number(entryMatch[1]),
        generationNumber: Number(entryMatch[2]),
        inUse: entryMatch[3] === "n",
      });
    }
  }

  return entries;
};

const parseClassicXrefSection = (source: string): ClassicXrefSection => {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("xref")) {
    throw new Error(
      "Export failed because this PDF does not expose a classic xref table at the final startxref offset. XRef streams are not supported by the current writer yet.",
    );
  }

  const trailerIndex = trimmed.indexOf("trailer");
  if (trailerIndex === -1) {
    throw new Error("Export failed because the classic xref trailer could not be located.");
  }

  const xrefBody = trimmed.slice("xref".length, trailerIndex).trim();
  const trailerBody = extractDictionaryBlock(trimmed, trailerIndex);
  if (!trailerBody) {
    throw new Error("Export failed because the classic xref trailer dictionary was truncated.");
  }

  const sizeValue = findDictionaryValue(trailerBody, "Size");
  const prevValue = findDictionaryValue(trailerBody, "Prev");

  return {
    entries: parseClassicXrefEntries(xrefBody),
    rootRef: parseObjectRef(findDictionaryValue(trailerBody, "Root")),
    prev: prevValue ? Number(prevValue) : null,
    size: sizeValue ? Number(sizeValue) : null,
  };
};

const readClassicXrefSectionAtOffset = async (
  file: File,
  offset: number,
): Promise<ClassicXrefSection> => {
  for (
    let length = XREF_SECTION_INITIAL_SCAN_BYTES;
    length <= XREF_SECTION_MAX_SCAN_BYTES;
    length *= 2
  ) {
    const end = Math.min(file.size, offset + length);
    const source = await readBlobLatin1(file, offset, end);

    try {
      return parseClassicXrefSection(source);
    } catch (error) {
      const isIncomplete =
        error instanceof Error &&
        /truncated|could not be located/i.test(error.message) &&
        end < file.size;

      if (isIncomplete) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Export failed because the classic xref section at offset ${offset} could not be read without scanning too much of the file.`,
  );
};

const findLastStartXrefInFile = async (file: File): Promise<number> => {
  const start = Math.max(0, file.size - STARTXREF_SCAN_BYTES);
  const source = await readBlobLatin1(file, start, file.size);
  const matches = [...source.matchAll(/startxref\s+(\d+)\s+%%EOF/g)];
  const lastMatch = matches.at(-1);

  if (!lastMatch) {
    throw new Error("Export failed because the PDF does not expose a readable startxref marker near the file tail.");
  }

  return Number(lastMatch[1]);
};

const readIndirectObjectAtOffset = async (
  file: File,
  ref: PdfObjectRef,
  offset: number,
): Promise<IndirectObject> => {
  for (
    let length = INDIRECT_OBJECT_INITIAL_SCAN_BYTES;
    length <= INDIRECT_OBJECT_MAX_SCAN_BYTES;
    length *= 2
  ) {
    const end = Math.min(file.size, offset + length);
    const source = await readBlobLatin1(file, offset, end);
    const match = source.match(/^\s*(\d+)\s+(\d+)\s+obj\b([\s\S]*?)\bendobj\b/);

    if (!match) {
      if (end < file.size) {
        continue;
      }
      break;
    }

    const objectRef = {
      objectNumber: Number(match[1]),
      generationNumber: Number(match[2]),
    };

    if (objectRef.objectNumber !== ref.objectNumber || objectRef.generationNumber !== ref.generationNumber) {
      throw new Error(
        `Export failed because xref resolved ${formatRef(ref)} to a different indirect object (${formatRef(objectRef)}).`,
      );
    }

    return {
      ref: objectRef,
      body: match[3].trim(),
    };
  }

  throw new Error(`Export failed because indirect object ${formatRef(ref)} could not be read safely.`);
};

const resolveObjectOffsetFromXrefChain = async (
  file: File,
  targetRef: PdfObjectRef,
  startXref: number,
): Promise<number> => {
  const visitedOffsets = new Set<number>();
  let currentOffset: number | null = startXref;

  while (currentOffset !== null && !visitedOffsets.has(currentOffset)) {
    visitedOffsets.add(currentOffset);
    const section = await readClassicXrefSectionAtOffset(file, currentOffset);
    const entry = section.entries.get(refKey(targetRef));

    if (entry?.inUse) {
      return entry.offset;
    }

    currentOffset = section.prev;
  }

  throw new Error(`Export failed because ${formatRef(targetRef)} could not be resolved from the xref chain.`);
};

const readPdfStructureForIncrementalUpdate = async (
  file: File,
): Promise<{
  startXref: number;
  rootRef: PdfObjectRef;
  nextObjectNumber: number;
  catalogObject: IndirectObject;
}> => {
  const startXref = await findLastStartXrefInFile(file);
  const latestSection = await readClassicXrefSectionAtOffset(file, startXref);
  const rootRef = latestSection.rootRef;

  if (!rootRef) {
    throw new Error("Export failed because the final trailer does not expose a /Root catalog reference.");
  }

  if (!latestSection.size || !Number.isFinite(latestSection.size)) {
    throw new Error("Export failed because the final trailer does not expose a usable /Size value.");
  }

  const catalogOffset = await resolveObjectOffsetFromXrefChain(file, rootRef, startXref);
  const catalogObject = await readIndirectObjectAtOffset(file, rootRef, catalogOffset);

  return {
    startXref,
    rootRef,
    nextObjectNumber: latestSection.size,
    catalogObject,
  };
};

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
  originalFile: File,
  originalByteLength: number,
  objects: IndirectObject[],
  previousStartXref: number,
  rootRef: PdfObjectRef,
): Blob => {
  const encoder = new TextEncoder();
  const sortedObjects = [...objects].sort((left, right) => left.ref.objectNumber - right.ref.objectNumber);
  const parts = ["\n"];
  let appendedLength = encoder.encode(parts[0]).length;
  const entries = sortedObjects.map((object) => {
    const serializedObject = `${object.ref.objectNumber} ${object.ref.generationNumber} obj\n${object.body}\nendobj\n`;
    const offset = originalByteLength + appendedLength;
    parts.push(serializedObject);
    appendedLength += encoder.encode(serializedObject).length;
    return { ref: object.ref, offset };
  });
  const xrefOffset = originalByteLength + appendedLength;
  const maxObjectNumber = Math.max(...sortedObjects.map((object) => object.ref.objectNumber));

  parts.push("xref\n");

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

    parts.push(`${startObjectNumber} ${sectionEntries.length}\n`);
    parts.push(
      sectionEntries
        .map((entry) => `${String(entry.offset).padStart(10, "0")} ${String(entry.ref.generationNumber).padStart(5, "0")} n \n`)
        .join(""),
    );
  }

  parts.push(
    `trailer\n<<\n  /Size ${maxObjectNumber + 1}\n  /Root ${formatRef(rootRef)}\n  /Prev ${previousStartXref}\n>>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return new Blob([originalFile, encoder.encode(parts.join(""))], { type: "application/pdf" });
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
      const diagnostics: PdfBookmarkReadDiagnostics = {
        pdfjsOutlineCount: null,
        fallbackOutlineCount: null,
        hasRawOutlinesMarker: false,
        usedFallback: false,
        warnings: [],
      };
      const objectUrl = URL.createObjectURL(file);
      try {
        const loadingTask = getDocument(objectUrl);
        const documentProxy = await loadingTask.promise;
        try {
          const outline = await documentProxy.getOutline();
          diagnostics.pdfjsOutlineCount = outline?.length ?? 0;

          if (!outline || outline.length === 0) {
            if (file.size > RAW_FALLBACK_MAX_BYTES) {
              diagnostics.hasRawOutlinesMarker = false;
              diagnostics.warnings.push(
                `Skipped the raw /Outlines fallback for this ${formatBytes(file.size)} PDF to avoid unsafe full-file string conversion in the browser.`,
              );

              return {
                bookmarks: [],
                diagnostics,
              };
            }

            const bytes = new Uint8Array(await file.arrayBuffer());
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
        };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },
    async writeBookmarks(file, bookmarks) {
      const structure = await readPdfStructureForIncrementalUpdate(file);
      const objectUrl = URL.createObjectURL(file);
      try {
        const loadingTask = getDocument(objectUrl);
        const documentProxy = await loadingTask.promise;
        try {
          const pageRefs = await readPageRefs(documentProxy);
          const outlineObjects = buildOutlineObjects(bookmarks, pageRefs, structure.nextObjectNumber);
          const patchedCatalog: IndirectObject = {
            ref: structure.catalogObject.ref,
            body: replaceOrAppendDictionaryRef(structure.catalogObject.body, "Outlines", outlineObjects[0].ref),
          };

          return appendIncrementalUpdate(
            file,
            file.size,
            [patchedCatalog, ...outlineObjects],
            structure.startXref,
            structure.rootRef,
          );
        } finally {
          await documentProxy.destroy();
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },
  };
};
