export interface ExcelSheetPreview {
  name: string;
  rowCount: number;
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface ExcelImportPreview {
  fileName: string;
  importedAt: string;
  sheets: ExcelSheetPreview[];
}
