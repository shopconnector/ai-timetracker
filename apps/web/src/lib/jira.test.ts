import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  adfToPlainText,
  formatIssueForDisplay,
  groupIssuesByParent,
  isSubtask,
  searchIssues,
  getIssue,
  getCurrentUser,
  getAllProjects,
  getIssueKeyById,
  getIssueKeysByIds,
  searchAllIssues,
  type JiraIssue,
  type GroupedIssues,
} from './jira';

// --- Mock factories ---

function mockIssue(overrides: Partial<JiraIssue> = {}): JiraIssue {
  return {
    id: '10001',
    key: 'TEST-1',
    fields: {
      summary: 'Test issue',
      status: { name: 'In Progress' },
      project: { key: 'TEST', name: 'Test Project' },
      ...overrides.fields,
    },
    ...overrides,
  } as JiraIssue;
}

function mockSubtask(parentKey: string, key: string, summary: string): JiraIssue {
  return mockIssue({
    id: key.replace('-', ''),
    key,
    fields: {
      summary,
      status: { name: 'To Do' },
      project: { key: parentKey.split('-')[0], name: 'Project' },
      issuetype: { name: 'Sub-task', subtask: true },
      parent: {
        id: '99999',
        key: parentKey,
        fields: {
          summary: `Parent of ${key}`,
          status: { name: 'In Progress' },
        },
      },
    },
  });
}

// --- Pure function tests ---

describe('adfToPlainText', () => {
  it('should return empty string for null/undefined', () => {
    expect(adfToPlainText(null)).toBe('');
    expect(adfToPlainText(undefined)).toBe('');
  });

  it('should return string as-is if input is string', () => {
    expect(adfToPlainText('plain text')).toBe('plain text');
  });

  it('should extract text from simple ADF paragraph', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    };
    expect(adfToPlainText(adf)).toBe('Hello world');
  });

  it('should handle multiple paragraphs', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Line 1' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Line 2' }] },
      ],
    };
    expect(adfToPlainText(adf)).toBe('Line 1\nLine 2');
  });

  it('should handle hardBreak nodes', () => {
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Before' },
            { type: 'hardBreak' },
            { type: 'text', text: 'After' },
          ],
        },
      ],
    };
    expect(adfToPlainText(adf)).toBe('Before\nAfter');
  });

  it('should handle heading, bulletList, codeBlock, blockquote with newlines', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'Title' }] },
        { type: 'bulletList', content: [{ type: 'text', text: 'Item 1' }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'code()' }] },
        { type: 'blockquote', content: [{ type: 'text', text: 'Quote' }] },
      ],
    };
    const result = adfToPlainText(adf);
    expect(result).toContain('Title\n');
    expect(result).toContain('Item 1\n');
    expect(result).toContain('code()\n');
    expect(result).toContain('Quote');
  });

  it('should return empty string for ADF without content array', () => {
    expect(adfToPlainText({ type: 'doc' })).toBe('');
    expect(adfToPlainText({})).toBe('');
  });
});

describe('formatIssueForDisplay', () => {
  it('should format issue correctly', () => {
    const issue = mockIssue({
      key: 'BCI-123',
      fields: {
        summary: 'Fix login bug',
        status: { name: 'In Progress' },
        project: { key: 'BCI', name: 'BeeCommerce' },
      },
    });

    const result = formatIssueForDisplay(issue);
    expect(result).toEqual({
      key: 'BCI-123',
      name: 'Fix login bug',
      project: 'BCI',
      status: 'In Progress',
      fullName: '[BCI-123] Fix login bug',
    });
  });
});

describe('isSubtask', () => {
  it('should return true for issue with subtask issuetype', () => {
    const issue = mockIssue({
      fields: {
        summary: 'Sub',
        status: { name: 'To Do' },
        project: { key: 'T', name: 'T' },
        issuetype: { name: 'Sub-task', subtask: true },
      },
    });
    expect(isSubtask(issue)).toBe(true);
  });

  it('should return true for issue with parent', () => {
    const issue = mockIssue({
      fields: {
        summary: 'Sub',
        status: { name: 'To Do' },
        project: { key: 'T', name: 'T' },
        parent: { id: '1', key: 'T-1', fields: { summary: 'Parent', status: { name: 'Done' } } },
      },
    });
    expect(isSubtask(issue)).toBe(true);
  });

  it('should return false for regular issue', () => {
    const issue = mockIssue();
    expect(isSubtask(issue)).toBe(false);
  });
});

describe('groupIssuesByParent', () => {
  it('should group subtasks under their parent', () => {
    const sub1 = mockSubtask('PROJ-10', 'PROJ-11', 'Subtask A');
    const sub2 = mockSubtask('PROJ-10', 'PROJ-12', 'Subtask B');

    const groups = groupIssuesByParent([sub1, sub2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].parentKey).toBe('PROJ-10');
    expect(groups[0].issues).toHaveLength(2);
  });

  it('should create separate groups for orphan issues', () => {
    const orphan1 = mockIssue({ key: 'T-1' });
    const orphan2 = mockIssue({ key: 'T-2' });

    const groups = groupIssuesByParent([orphan1, orphan2]);
    expect(groups).toHaveLength(2);
    groups.forEach(g => {
      expect(g.parentKey).toBeNull();
      expect(g.issues).toHaveLength(1);
    });
  });

  it('should handle parent issue with subtasks field', () => {
    const parent = mockIssue({
      key: 'PROJ-10',
      fields: {
        summary: 'Parent task',
        status: { name: 'In Progress' },
        project: { key: 'PROJ', name: 'Project' },
        subtasks: [
          { id: '11', key: 'PROJ-11', fields: { summary: 'Sub', status: { name: 'To Do' }, issuetype: { name: 'Sub-task', subtask: true } } },
        ],
      },
    });

    const groups = groupIssuesByParent([parent]);
    expect(groups).toHaveLength(1);
    expect(groups[0].parentKey).toBe('PROJ-10');
    expect(groups[0].issues[0].key).toBe('PROJ-10'); // Parent added as first
  });

  it('should sort groups: parent groups first, orphans last', () => {
    const orphan = mockIssue({ key: 'T-1' });
    const sub = mockSubtask('PROJ-10', 'PROJ-11', 'Subtask');

    const groups = groupIssuesByParent([orphan, sub]);
    expect(groups[0].parentKey).toBe('PROJ-10');
    expect(groups[1].parentKey).toBeNull();
  });

  it('should handle empty array', () => {
    expect(groupIssuesByParent([])).toEqual([]);
  });

  it('should handle mix of subtasks and orphans', () => {
    const sub1 = mockSubtask('P-1', 'P-2', 'Sub 1');
    const sub2 = mockSubtask('P-1', 'P-3', 'Sub 2');
    const orphan = mockIssue({ key: 'X-1' });
    const sub3 = mockSubtask('Q-1', 'Q-2', 'Sub 3');

    const groups = groupIssuesByParent([sub1, sub2, orphan, sub3]);
    // 2 parent groups (P-1, Q-1) + 1 orphan
    expect(groups).toHaveLength(3);
    const parentGroups = groups.filter(g => g.parentKey !== null);
    expect(parentGroups).toHaveLength(2);
  });
});

// --- API function tests (mocked fetch) ---

describe('Jira API functions', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JIRA_SERVICE_EMAIL = 'test@example.com';
    process.env.JIRA_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  describe('searchIssues', () => {
    it('should POST to search endpoint with JQL', async () => {
      const mockResult = { issues: [mockIssue()], total: 1, maxResults: 50 };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      } as Response);

      const result = await searchIssues('assignee = "me"');
      expect(result.issues).toHaveLength(1);
      expect(fetch).toHaveBeenCalledOnce();

      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe('https://beecommerce.atlassian.net/rest/api/3/search/jql');
      expect(options?.method).toBe('POST');
      const body = JSON.parse(options?.body as string);
      expect(body.jql).toBe('assignee = "me"');
    });

    it('should throw on non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      } as Response);

      await expect(searchIssues('project = TEST')).rejects.toThrow('Jira API error: 401 - Unauthorized');
    });

    it('should pass custom maxResults and fields', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ issues: [], total: 0, maxResults: 10 }),
      } as Response);

      await searchIssues('project = TEST', 10, ['summary', 'status']);
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(body.maxResults).toBe(10);
      expect(body.fields).toEqual(['summary', 'status']);
    });
  });

  describe('getIssue', () => {
    it('should fetch single issue by key', async () => {
      const issue = mockIssue({ key: 'BCI-42' });
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(issue),
      } as Response);

      const result = await getIssue('BCI-42');
      expect(result.key).toBe('BCI-42');
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://beecommerce.atlassian.net/rest/api/3/issue/BCI-42');
    });

    it('should throw on 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      await expect(getIssue('NOPE-999')).rejects.toThrow('Jira API error: 404');
    });
  });

  describe('getCurrentUser', () => {
    it('should fetch /myself endpoint', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          accountId: 'abc123',
          emailAddress: 'user@example.com',
          displayName: 'Test User',
          active: true,
        }),
      } as Response);

      const user = await getCurrentUser();
      expect(user.displayName).toBe('Test User');
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://beecommerce.atlassian.net/rest/api/3/myself');
    });
  });

  describe('getAllProjects', () => {
    it('should return project values array', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          values: [
            { id: '1', key: 'BCI', name: 'BeeCommerce' },
            { id: '2', key: 'INT', name: 'Internal' },
          ],
        }),
      } as Response);

      const projects = await getAllProjects();
      expect(projects).toHaveLength(2);
      expect(projects[0].key).toBe('BCI');
    });

    it('should return empty array when values is missing', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      const projects = await getAllProjects();
      expect(projects).toEqual([]);
    });
  });

  describe('getIssueKeyById', () => {
    it('should return issue key for numeric ID', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ key: 'BCI-42' }),
      } as Response);

      const key = await getIssueKeyById(10042);
      expect(key).toBe('BCI-42');
    });

    it('should return UNKNOWN-{id} on failure', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const key = await getIssueKeyById(99999);
      expect(key).toBe('UNKNOWN-99999');
    });
  });

  describe('getIssueKeysByIds', () => {
    it('should batch-fetch issue keys', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ key: 'A-1' }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ key: 'B-2' }) } as Response);

      const keyMap = await getIssueKeysByIds([100, 200]);
      expect(keyMap.get('100')).toBe('A-1');
      expect(keyMap.get('200')).toBe('B-2');
    });

    it('should deduplicate IDs', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ key: 'A-1' }),
      } as Response);

      await getIssueKeysByIds([100, 100, 100]);
      expect(fetch).toHaveBeenCalledTimes(1); // Only one fetch for deduped ID
    });
  });

  describe('searchAllIssues', () => {
    it('should try exact key match first when query looks like issue key', async () => {
      const issue = mockIssue({ key: 'BCI-42' });
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(issue),
      } as Response);

      const results = await searchAllIssues('BCI-42');
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('BCI-42');
      // Should call getIssue, not searchIssues
      expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/issue/BCI-42');
    });

    it('should fall back to text search if key lookup fails', async () => {
      // First call (getIssue) fails
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);
      // Second call (searchIssues) succeeds
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ issues: [mockIssue()], total: 1, maxResults: 30 }),
      } as Response);

      const results = await searchAllIssues('bci-99');
      expect(results).toHaveLength(1);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should use text search for non-key queries', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ issues: [mockIssue()], total: 1, maxResults: 30 }),
      } as Response);

      await searchAllIssues('login bug');
      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(body.jql).toContain('text ~ "login bug"');
    });
  });

  describe('auth header', () => {
    it('should throw when JIRA_SERVICE_EMAIL is not set', async () => {
      delete process.env.JIRA_SERVICE_EMAIL;
      await expect(searchIssues('test')).rejects.toThrow('JIRA_SERVICE_EMAIL or JIRA_API_KEY not set');
    });

    it('should throw when JIRA_API_KEY is not set', async () => {
      delete process.env.JIRA_API_KEY;
      await expect(searchIssues('test')).rejects.toThrow('JIRA_SERVICE_EMAIL or JIRA_API_KEY not set');
    });

    it('should include Basic auth header', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ issues: [], total: 0, maxResults: 50 }),
      } as Response);

      await searchIssues('test');
      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers.Authorization).toMatch(/^Basic /);
      // Verify it's base64 of email:apiKey
      const decoded = Buffer.from(headers.Authorization.replace('Basic ', ''), 'base64').toString();
      expect(decoded).toBe('test@example.com:test-api-key');
    });
  });
});
