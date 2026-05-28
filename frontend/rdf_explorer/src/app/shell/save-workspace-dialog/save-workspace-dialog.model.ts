export interface SaveWorkspaceDialogData {
  currentName?: string;
  currentId?: string;
  existingNames?: string[];
}

export interface SaveWorkspaceDialogResult {
  name: string;
  overwriteId?: string;
}
