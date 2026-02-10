// Readiness Criteria parser from Jira comments (Automation for Jira)

export type ReadinessLevel = 'red' | 'yellow' | 'green' | 'unknown';

export interface ReadinessCriteria {
  completeness: ReadinessLevel;
  clarity: ReadinessLevel;
  auditability: ReadinessLevel;
  estimated: ReadinessLevel;
  suggestions: string[];
  overallScore: number; // 0-4 (count of green)
}

interface JiraComment {
  author: string;
  created: string;
  body: string;
}

const EMOJI_TO_LEVEL: Record<string, ReadinessLevel> = {
  '\uD83D\uDD34': 'red', // 🔴
  '\uD83D\uDFE1': 'yellow', // 🟡
  '\uD83D\uDFE2': 'green', // 🟢
};

function parseLevel(text: string, keyword: string): ReadinessLevel {
  // Match pattern like "Completeness 🔴" or "Completeness: 🟢"
  const regex = new RegExp(`${keyword}[:\\s]*([\\u{1F534}\\u{1F7E1}\\u{1F7E2}])`, 'u');
  const match = text.match(regex);
  if (match) {
    return EMOJI_TO_LEVEL[match[1]] || 'unknown';
  }

  // Also try matching with text labels
  const textRegex = new RegExp(`${keyword}[:\\s]*(red|yellow|green|czerwony|zolty|zielony)`, 'i');
  const textMatch = text.match(textRegex);
  if (textMatch) {
    const val = textMatch[1].toLowerCase();
    if (val === 'red' || val === 'czerwony') return 'red';
    if (val === 'yellow' || val === 'zolty') return 'yellow';
    if (val === 'green' || val === 'zielony') return 'green';
  }

  return 'unknown';
}

/**
 * Parse Readiness Criteria from a single comment body.
 * Returns null if the comment doesn't contain RC data.
 */
export function parseReadinessCriteria(commentBody: string): ReadinessCriteria | null {
  if (!commentBody) return null;

  // Check if this looks like a readiness criteria comment
  const hasReadinessKeywords =
    /readiness|completeness|clarity|auditability|estimated/i.test(commentBody) ||
    /gotowo[sś][cć]|kompletno[sś][cć]|jasno[sś][cć]|audytowalno[sś][cć]|estymacja/i.test(
      commentBody
    );

  if (!hasReadinessKeywords) return null;

  const completeness =
    parseLevel(commentBody, 'Completeness') !== 'unknown'
      ? parseLevel(commentBody, 'Completeness')
      : parseLevel(commentBody, 'Kompletno[sś][cć]');

  const clarity =
    parseLevel(commentBody, 'Clarity') !== 'unknown'
      ? parseLevel(commentBody, 'Clarity')
      : parseLevel(commentBody, 'Jasno[sś][cć]');

  const auditability =
    parseLevel(commentBody, 'Auditability') !== 'unknown'
      ? parseLevel(commentBody, 'Auditability')
      : parseLevel(commentBody, 'Audytowalno[sś][cć]');

  const estimated =
    parseLevel(commentBody, 'Estimated') !== 'unknown'
      ? parseLevel(commentBody, 'Estimated')
      : parseLevel(commentBody, 'Estymacja');

  // If none were found, this isn't a RC comment
  if (
    completeness === 'unknown' &&
    clarity === 'unknown' &&
    auditability === 'unknown' &&
    estimated === 'unknown'
  ) {
    return null;
  }

  // Extract suggestions (lines starting with - or * after "Suggestions" or "Sugestie")
  const suggestions: string[] = [];
  const suggestionsMatch = commentBody.match(/(?:suggestions|sugestie)[:\s]*([\s\S]*?)(?:\n\n|$)/i);
  if (suggestionsMatch) {
    const lines = suggestionsMatch[1].split('\n');
    for (const line of lines) {
      const trimmed = line.replace(/^[\s\-\*]+/, '').trim();
      if (trimmed) suggestions.push(trimmed);
    }
  }

  const levels = [completeness, clarity, auditability, estimated];
  const overallScore = levels.filter(l => l === 'green').length;

  return {
    completeness,
    clarity,
    auditability,
    estimated,
    suggestions,
    overallScore,
  };
}

/**
 * Find the most recent Readiness Criteria comment from a list of Jira comments.
 * Checks from newest to oldest.
 */
export function findReadinessComment(comments: JiraComment[]): ReadinessCriteria | null {
  // Check from newest to oldest
  for (let i = comments.length - 1; i >= 0; i--) {
    const rc = parseReadinessCriteria(comments[i].body);
    if (rc) return rc;
  }
  return null;
}
