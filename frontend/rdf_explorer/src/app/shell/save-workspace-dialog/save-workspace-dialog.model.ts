export interface SaveWorkspaceDialogData {
  currentName?: string;
  currentId?: string;
}

export interface SaveWorkspaceDialogResult {
  name: string;
  overwriteId?: string;
}
