const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '/timetracker';

export function apiUrl(path: string): string {
  return `${BASE_PATH}${path}`;
}
