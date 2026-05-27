const AUTO_RUN_KEY = 'platform.handoff.autoRun';

export function getAutoRunHandoff(): boolean {
  const val = localStorage.getItem(AUTO_RUN_KEY);
  return val === null ? true : val === 'true';
}

export function setAutoRunHandoff(value: boolean): void {
  localStorage.setItem(AUTO_RUN_KEY, String(value));
}
