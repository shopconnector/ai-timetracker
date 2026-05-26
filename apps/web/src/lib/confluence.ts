/**
 * Confluence Cloud REST API v2 client.
 * Requires Atlassian OAuth 2.0 (3LO) to be configured — there's no Basic Auth path
 * for Confluence in this app. All requests go through api.atlassian.com/ex/confluence/{cloudid}.
 */

import {
  getConfluenceOAuthBase,
  getValidAccessToken,
  isOAuthConfigured,
} from './atlassianOAuth';

export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
  homepageId?: string;
}

export interface ConfluencePage {
  id: string;
  status: string;
  title: string;
  spaceId: string;
  parentId?: string;
  authorId?: string;
  version: {
    number: number;
    createdAt: string;
  };
  body?: {
    storage?: {
      value: string;
      representation: 'storage';
    };
  };
}

async function authHeaders(): Promise<HeadersInit> {
  if (!isOAuthConfigured()) {
    throw new Error('Confluence wymaga OAuth — połącz Atlassian w Settings.');
  }
  const token = await getValidAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

function baseUrl(): string {
  return `${getConfluenceOAuthBase()}/wiki/api/v2`;
}

async function handleConfluenceError(res: Response, ctx: string): Promise<never> {
  const text = await res.text().catch(() => '');
  throw new Error(`Confluence ${ctx} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
}

export async function listSpaces(limit = 50): Promise<ConfluenceSpace[]> {
  const res = await fetch(`${baseUrl()}/spaces?limit=${limit}`, {
    headers: await authHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) await handleConfluenceError(res, 'listSpaces');
  const data = await res.json();
  return data.results || [];
}

export async function getPage(id: string): Promise<ConfluencePage> {
  const res = await fetch(`${baseUrl()}/pages/${id}?body-format=storage`, {
    headers: await authHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) await handleConfluenceError(res, `getPage(${id})`);
  return res.json();
}

export interface CreatePageInput {
  spaceId: string;
  title: string;
  contentStorage: string; // Confluence Storage Format (HTML-like)
  parentId?: string;
}

export async function createPage(input: CreatePageInput): Promise<ConfluencePage> {
  const body = {
    spaceId: input.spaceId,
    status: 'current',
    title: input.title,
    parentId: input.parentId,
    body: {
      representation: 'storage' as const,
      value: input.contentStorage,
    },
  };
  const res = await fetch(`${baseUrl()}/pages`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) await handleConfluenceError(res, 'createPage');
  return res.json();
}

export interface UpdatePageInput {
  id: string;
  title: string;
  contentStorage: string;
  version: number; // current version number (server expects +0, returns +1)
}

export async function updatePage(input: UpdatePageInput): Promise<ConfluencePage> {
  const body = {
    id: input.id,
    status: 'current',
    title: input.title,
    body: {
      representation: 'storage' as const,
      value: input.contentStorage,
    },
    version: {
      number: input.version + 1,
    },
  };
  const res = await fetch(`${baseUrl()}/pages/${input.id}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) await handleConfluenceError(res, `updatePage(${input.id})`);
  return res.json();
}
