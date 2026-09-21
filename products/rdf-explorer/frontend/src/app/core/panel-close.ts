export async function closePanelFlow(
  dirty: boolean,
  confirmDiscard: () => Promise<boolean>,
  close: () => void,
): Promise<boolean> {
  if (dirty && !(await confirmDiscard())) return false;
  close();
  return true;
}
