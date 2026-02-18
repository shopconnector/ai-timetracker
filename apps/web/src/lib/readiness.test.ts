import { describe, it, expect } from 'vitest';
import { parseReadinessCriteria, findReadinessComment } from './readiness';

describe('parseReadinessCriteria', () => {
  describe('returns null for non-RC content', () => {
    it('should return null for empty string', () => {
      expect(parseReadinessCriteria('')).toBeNull();
    });

    it('should return null for unrelated comment', () => {
      expect(parseReadinessCriteria('This is a regular comment about the task.')).toBeNull();
    });

    it('should return null when keywords present but no levels found', () => {
      // Has keyword "completeness" but no emoji or text level
      expect(parseReadinessCriteria('We need to check completeness of this.')).toBeNull();
    });
  });

  describe('emoji-based parsing', () => {
    it('should parse all-green RC with emoji circles', () => {
      const body = `Readiness Criteria:
Completeness 🟢
Clarity 🟢
Auditability 🟢
Estimated 🟢`;

      const rc = parseReadinessCriteria(body);
      expect(rc).not.toBeNull();
      expect(rc!.completeness).toBe('green');
      expect(rc!.clarity).toBe('green');
      expect(rc!.auditability).toBe('green');
      expect(rc!.estimated).toBe('green');
      expect(rc!.overallScore).toBe(4);
    });

    it('should parse mixed levels with emoji circles', () => {
      const body = `Readiness Criteria:
Completeness 🔴
Clarity 🟡
Auditability 🟢
Estimated 🔴`;

      const rc = parseReadinessCriteria(body);
      expect(rc).not.toBeNull();
      expect(rc!.completeness).toBe('red');
      expect(rc!.clarity).toBe('yellow');
      expect(rc!.auditability).toBe('green');
      expect(rc!.estimated).toBe('red');
      expect(rc!.overallScore).toBe(1);
    });

    it('should handle colon separator after keyword', () => {
      const body = `Completeness: 🟢
Clarity: 🟡
Auditability: 🟢
Estimated: 🔴`;

      const rc = parseReadinessCriteria(body);
      expect(rc).not.toBeNull();
      expect(rc!.completeness).toBe('green');
      expect(rc!.clarity).toBe('yellow');
      expect(rc!.auditability).toBe('green');
      expect(rc!.estimated).toBe('red');
      expect(rc!.overallScore).toBe(2);
    });

    it('should handle all-red result', () => {
      const body = `Readiness:
Completeness 🔴
Clarity 🔴
Auditability 🔴
Estimated 🔴`;

      const rc = parseReadinessCriteria(body);
      expect(rc!.overallScore).toBe(0);
    });

    it('should handle all-yellow result', () => {
      const body = `Readiness:
Completeness 🟡
Clarity 🟡
Auditability 🟡
Estimated 🟡`;

      const rc = parseReadinessCriteria(body);
      expect(rc!.overallScore).toBe(0);
      expect(rc!.completeness).toBe('yellow');
    });
  });

  describe('text-based parsing (English)', () => {
    it('should parse English text labels', () => {
      const body = `Readiness Criteria:
Completeness: green
Clarity: yellow
Auditability: red
Estimated: green`;

      const rc = parseReadinessCriteria(body);
      expect(rc).not.toBeNull();
      expect(rc!.completeness).toBe('green');
      expect(rc!.clarity).toBe('yellow');
      expect(rc!.auditability).toBe('red');
      expect(rc!.estimated).toBe('green');
      expect(rc!.overallScore).toBe(2);
    });

    it('should be case-insensitive for text labels', () => {
      const body = `Readiness Criteria:
Completeness: GREEN
Clarity: Yellow
Auditability: RED
Estimated: Green`;

      const rc = parseReadinessCriteria(body);
      expect(rc!.completeness).toBe('green');
      expect(rc!.clarity).toBe('yellow');
      expect(rc!.auditability).toBe('red');
      expect(rc!.estimated).toBe('green');
    });
  });

  describe('text-based parsing (Polish)', () => {
    it('should parse Polish text labels', () => {
      const body = `Gotowość:
Kompletność: zielony
Jasność: zolty
Audytowalność: czerwony
Estymacja: zielony`;

      const rc = parseReadinessCriteria(body);
      expect(rc).not.toBeNull();
      expect(rc!.completeness).toBe('green');
      expect(rc!.clarity).toBe('yellow');
      expect(rc!.auditability).toBe('red');
      expect(rc!.estimated).toBe('green');
    });

    it('should match Polish keywords with diacritics variations', () => {
      // Keyword regex uses [sś][cć] patterns, so both forms should work
      const body = `Kompletność: 🟢
Jasność: 🟡
Audytowalność: 🟢
Estymacja: 🔴`;

      const rc = parseReadinessCriteria(body);
      expect(rc).not.toBeNull();
      expect(rc!.completeness).toBe('green');
      expect(rc!.clarity).toBe('yellow');
      expect(rc!.auditability).toBe('green');
      expect(rc!.estimated).toBe('red');
    });

    it('should detect readiness via Polish keywords in body', () => {
      const body = `Kompletność 🟢`;

      const rc = parseReadinessCriteria(body);
      expect(rc).not.toBeNull();
      expect(rc!.completeness).toBe('green');
      // Other fields should be unknown since not specified
      expect(rc!.clarity).toBe('unknown');
      expect(rc!.auditability).toBe('unknown');
      expect(rc!.estimated).toBe('unknown');
    });
  });

  describe('partial criteria', () => {
    it('should parse when only some fields are present', () => {
      const body = `Readiness Criteria:
Completeness 🟢
Clarity 🟡`;

      const rc = parseReadinessCriteria(body);
      expect(rc).not.toBeNull();
      expect(rc!.completeness).toBe('green');
      expect(rc!.clarity).toBe('yellow');
      expect(rc!.auditability).toBe('unknown');
      expect(rc!.estimated).toBe('unknown');
      expect(rc!.overallScore).toBe(1);
    });

    it('should parse single field', () => {
      const body = `Estimated 🟢`;

      const rc = parseReadinessCriteria(body);
      expect(rc).not.toBeNull();
      expect(rc!.estimated).toBe('green');
      expect(rc!.overallScore).toBe(1);
    });
  });

  describe('suggestions extraction', () => {
    it('should extract suggestions from dash-prefixed lines', () => {
      const body = `Readiness Criteria:
Completeness 🟡
Clarity 🟢
Auditability 🟢
Estimated 🟢

Suggestions:
- Add acceptance criteria
- Include wireframes
- Define edge cases`;

      const rc = parseReadinessCriteria(body);
      expect(rc).not.toBeNull();
      expect(rc!.suggestions).toHaveLength(3);
      expect(rc!.suggestions).toContain('Add acceptance criteria');
      expect(rc!.suggestions).toContain('Include wireframes');
      expect(rc!.suggestions).toContain('Define edge cases');
    });

    it('should extract suggestions from asterisk-prefixed lines', () => {
      const body = `Readiness Criteria:
Completeness 🔴

Suggestions:
* Fix the description
* Add story points`;

      const rc = parseReadinessCriteria(body);
      expect(rc!.suggestions).toHaveLength(2);
      expect(rc!.suggestions).toContain('Fix the description');
      expect(rc!.suggestions).toContain('Add story points');
    });

    it('should extract Polish suggestions', () => {
      const body = `Kompletność: 🟡

Sugestie:
- Dodaj kryteria akceptacji
- Uzupełnij opis`;

      const rc = parseReadinessCriteria(body);
      expect(rc!.suggestions).toHaveLength(2);
      expect(rc!.suggestions).toContain('Dodaj kryteria akceptacji');
    });

    it('should return empty suggestions array when none present', () => {
      const body = `Completeness 🟢
Clarity 🟢
Auditability 🟢
Estimated 🟢`;

      const rc = parseReadinessCriteria(body);
      expect(rc!.suggestions).toEqual([]);
    });

    it('should stop extracting suggestions at double newline', () => {
      const body = `Completeness 🟡

Suggestions:
- First

- Third`;

      const rc = parseReadinessCriteria(body);
      // Regex stops at \n\n, so only "First" is captured
      expect(rc!.suggestions).toContain('First');
      expect(rc!.suggestions).not.toContain('Third');
      expect(rc!.suggestions).not.toContain('');
    });
  });

  describe('overallScore calculation', () => {
    it('should count 4 greens = score 4', () => {
      const body = `Completeness 🟢 Clarity 🟢 Auditability 🟢 Estimated 🟢`;
      expect(parseReadinessCriteria(body)!.overallScore).toBe(4);
    });

    it('should count 0 greens = score 0', () => {
      const body = `Completeness 🔴 Clarity 🟡 Auditability 🔴 Estimated 🟡`;
      expect(parseReadinessCriteria(body)!.overallScore).toBe(0);
    });

    it('should count unknown as non-green', () => {
      const body = `Completeness 🟢`;
      // Only 1 green, rest unknown
      expect(parseReadinessCriteria(body)!.overallScore).toBe(1);
    });
  });
});

describe('findReadinessComment', () => {
  it('should return null for empty comments array', () => {
    expect(findReadinessComment([])).toBeNull();
  });

  it('should return null when no comment contains RC', () => {
    const comments = [
      { author: 'alice', created: '2024-01-15T09:00:00Z', body: 'Regular comment' },
      { author: 'bob', created: '2024-01-15T10:00:00Z', body: 'Another comment' },
    ];
    expect(findReadinessComment(comments)).toBeNull();
  });

  it('should find RC in single comment', () => {
    const comments = [
      { author: 'bot', created: '2024-01-15T09:00:00Z', body: 'Completeness 🟢\nClarity 🟢\nAuditability 🟢\nEstimated 🟢' },
    ];
    const rc = findReadinessComment(comments);
    expect(rc).not.toBeNull();
    expect(rc!.overallScore).toBe(4);
  });

  it('should return the MOST RECENT RC comment (last in array)', () => {
    const comments = [
      { author: 'bot', created: '2024-01-14T09:00:00Z', body: 'Completeness 🔴\nClarity 🔴\nAuditability 🔴\nEstimated 🔴' },
      { author: 'alice', created: '2024-01-14T10:00:00Z', body: 'Updated the description' },
      { author: 'bot', created: '2024-01-15T09:00:00Z', body: 'Completeness 🟢\nClarity 🟢\nAuditability 🟢\nEstimated 🟢' },
    ];
    const rc = findReadinessComment(comments);
    expect(rc).not.toBeNull();
    // Should pick the newer one (all green, score 4)
    expect(rc!.overallScore).toBe(4);
    expect(rc!.completeness).toBe('green');
  });

  it('should skip non-RC comments and find the RC one', () => {
    const comments = [
      { author: 'alice', created: '2024-01-15T09:00:00Z', body: 'Please review' },
      { author: 'bot', created: '2024-01-15T09:30:00Z', body: 'Completeness 🟡\nClarity 🟢\nAuditability 🟢\nEstimated 🔴' },
      { author: 'bob', created: '2024-01-15T10:00:00Z', body: 'Looks good to me' },
    ];
    const rc = findReadinessComment(comments);
    expect(rc).not.toBeNull();
    expect(rc!.completeness).toBe('yellow');
    expect(rc!.estimated).toBe('red');
    expect(rc!.overallScore).toBe(2);
  });

  it('should prefer newer RC even if older RC also exists', () => {
    const comments = [
      { author: 'bot', created: '2024-01-14T09:00:00Z', body: 'Completeness 🟢\nClarity 🟢\nAuditability 🟢\nEstimated 🟢' },
      { author: 'bot', created: '2024-01-15T09:00:00Z', body: 'Completeness 🔴\nClarity 🔴\nAuditability 🔴\nEstimated 🔴' },
    ];
    const rc = findReadinessComment(comments);
    // The newer (last) one should win — all red
    expect(rc!.overallScore).toBe(0);
    expect(rc!.completeness).toBe('red');
  });
});
