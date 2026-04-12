export type SaveSupport = {
  canUseFileSystemAccess: boolean;
};

export const getSaveSupport = (): SaveSupport => ({
  canUseFileSystemAccess: "showSaveFilePicker" in window,
});

export const createEditedPdfFileName = (fileName: string | null): string => {
  if (!fileName) {
    return "outline.edited.pdf";
  }

  return fileName.replace(/\.pdf$/i, "") + ".edited.pdf";
};

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
