import { childDownloadName } from '../agents/declarationOfCapital/splitChildNames.js';

/** The fields of a file row that decide the name it downloads under. */
export interface NamedFile {
  filename: string;
  label: string | null;
  parent_file_id: string | null;
  page_from: number | null;
  page_to: number | null;
}

/**
 * The name a file saves under, for the single-file download and for the
 * all-files zip alike (openspec `workspace-documents`): the stored filename,
 * except a named child of a split PDF, which saves under its list document's
 * name plus its source. `parentFilename` is the filename of the file it was
 * cut from ('' when that file is gone).
 */
export function downloadNameOf(file: NamedFile, parentFilename: string): string {
  if (file.label && file.parent_file_id && file.page_from !== null && file.page_to !== null) {
    return childDownloadName(file.label, parentFilename, file.page_from, file.page_to);
  }
  return file.filename;
}
