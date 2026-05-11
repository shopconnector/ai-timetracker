import { describe, expect, it } from 'vitest';
import { deriveProjectKey, isBeeCommerce } from './beecommerce-filter';

describe('isBeeCommerce', () => {
  it('matches AW title with BC repo name', () => {
    expect(isBeeCommerce({ kind: 'aw', app: 'Cursor', title: 'page.tsx — ai-timetracker — Cursor' })).toBe(true);
  });

  it('matches git repo under ~/projects/beecommerce/', () => {
    expect(isBeeCommerce({ kind: 'git', repoPath: '/Users/gaca/projects/beecommerce/bee-team' })).toBe(true);
  });

  it('matches Tempo issue with BCI prefix', () => {
    expect(isBeeCommerce({ kind: 'tempo', issueKey: 'BCI-127' })).toBe(true);
  });

  it('matches NEU prefix (NEUCA RFI)', () => {
    expect(isBeeCommerce({ kind: 'tempo', issueKey: 'NEU-3' })).toBe(true);
  });

  it('matches Slack channel #bee-team-dev', () => {
    expect(isBeeCommerce({ kind: 'slack', channel: '#bee-team-dev' })).toBe(true);
  });

  it('matches BC atlassian URL', () => {
    expect(isBeeCommerce({ kind: 'aw-browser', url: 'https://beecommerce.atlassian.net/wiki/spaces/BA' })).toBe(true);
  });

  it('matches plan content with NEUCA keyword', () => {
    expect(isBeeCommerce({
      kind: 'plan',
      planContent: '# Plan: Pull projektów z Confluence BA + audyt landing page beecommerce'
    })).toBe(true);
  });

  it('REJECTS personal repo dziennikzywienia in AW title', () => {
    expect(isBeeCommerce({ kind: 'aw', app: 'Cursor', title: 'page.tsx — dziennikzywienia — Cursor' })).toBe(false);
  });

  it('REJECTS path under ~/projects/personal/', () => {
    expect(isBeeCommerce({ kind: 'git', repoPath: '/Users/gaca/projects/personal/agent-pack' })).toBe(false);
  });

  it('REJECTS Slack #general (no BC keyword)', () => {
    expect(isBeeCommerce({ kind: 'slack', channel: '#general' })).toBe(false);
  });

  it('REJECTS personal channel', () => {
    expect(isBeeCommerce({ kind: 'slack', channel: '#personal' })).toBe(false);
  });

  it('PERSONAL wins over BC if path is /personal/ even with BC repo name in subdir', () => {
    // Edge case: jeśli Bartek skopiował ai-timetracker pod ~/projects/personal/ai-timetracker
    expect(isBeeCommerce({ kind: 'git', repoPath: '/Users/gaca/projects/personal/ai-timetracker' })).toBe(false);
  });

  it('REJECTS plan z LinkedIn relaunch jako personal', () => {
    expect(isBeeCommerce({
      kind: 'plan',
      planContent: '# Plan: LinkedIn relaunch + media plan + dashboard integration\nOsobista marka, focus na...'
    })).toBe(false);
  });

  it('REJECTS plan z bartoszgaca.pl', () => {
    expect(isBeeCommerce({
      kind: 'plan',
      planContent: '# Bot toggle przez komendę w czacie — bartoszgaca.pl + agent-pack'
    })).toBe(false);
  });

  it('REJECTS plan o biurozlobinski (klient prywatny)', () => {
    expect(isBeeCommerce({
      kind: 'plan',
      planContent: '# Plan: Portal księgowy dla biurozlobinski.pl'
    })).toBe(false);
  });

  it('ACCEPTS plan z ucpstorefront (BC) mimo wzmianki o LinkedIn integration jako external', () => {
    // Edge: jeśli kiedyś plan UCP wspomni LinkedIn share button, exclude wins.
    // Świadoma decyzja: filtr jest agresywny, lepiej false-negative niż false-positive
    // (user zobaczy w UI "Pokaż wszystko" toggle później).
    expect(isBeeCommerce({
      kind: 'plan',
      planContent: '# Plan UCP feature\nucpstorefront beecommerce hemplab'
    })).toBe(true);
  });
});

describe('deriveProjectKey', () => {
  it('extracts repo name from path', () => {
    expect(deriveProjectKey({ kind: 'git', repoPath: '/Users/gaca/projects/beecommerce/bee-team' })).toBe('bee-team');
  });

  it('uses Jira prefix for tempo', () => {
    expect(deriveProjectKey({ kind: 'tempo', issueKey: 'BCI-127' })).toBe('jira-bci');
  });

  it('uses project name from AW', () => {
    expect(deriveProjectKey({ kind: 'aw', project: 'ai-timetracker' })).toBe('ai-timetracker');
  });

  it('falls back to slack-channel', () => {
    expect(deriveProjectKey({ kind: 'slack', channel: '#bee-team-dev' })).toBe('slack-bee-team-dev');
  });
});
