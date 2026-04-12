export const acceptPdfFile = ".pdf,application/pdf";

export const isPdfFile = (file: File): boolean =>
  file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
