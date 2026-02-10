// My Issues Store - localStorage persistence for notes and completion tracking
// Follows same pattern as assignmentStore.ts

const STORAGE_KEY = 'timetracker_my_issues_local';

export interface IssueLocalData {
  notes: string;
  doneByMe: boolean;
  updatedAt: string;
}

type AllIssueData = Record<string, IssueLocalData>; // issueKey → local data

function loadAll(): AllIssueData {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return {};
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveAll(data: AllIssueData): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getAllIssueLocalData(): AllIssueData {
  return loadAll();
}

export function getIssueLocalData(issueKey: string): IssueLocalData | null {
  const all = loadAll();
  return all[issueKey] || null;
}

export function setIssueNotes(issueKey: string, notes: string): void {
  const all = loadAll();
  if (!all[issueKey]) {
    all[issueKey] = { notes: '', doneByMe: false, updatedAt: '' };
  }
  all[issueKey].notes = notes;
  all[issueKey].updatedAt = new Date().toISOString();
  saveAll(all);
}

export function setIssueDoneByMe(issueKey: string, done: boolean): void {
  const all = loadAll();
  if (!all[issueKey]) {
    all[issueKey] = { notes: '', doneByMe: false, updatedAt: '' };
  }
  all[issueKey].doneByMe = done;
  all[issueKey].updatedAt = new Date().toISOString();
  saveAll(all);
}
