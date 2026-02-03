/**
 * Text similarity utilities for matching activities with worklogs
 */

// Common stop words to filter out
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'are',
  'been',
  'be',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'need',
  'dare',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'where',
  'when',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'also',
  'now',
  'via',
]);

// Meeting-specific keywords for better matching
const MEETING_KEYWORDS = [
  'standup',
  'daily',
  'sync',
  'review',
  'planning',
  'retro',
  'retrospective',
  'demo',
  'sprint',
  'grooming',
  'refinement',
  'kickoff',
  'status',
  'check-in',
  'one-on-one',
  '1on1',
  '1:1',
  'weekly',
  'monthly',
  'quarterly',
  'call',
  'meeting',
  'meet',
  'interview',
  'workshop',
  'training',
  'onboarding',
];

export interface SimilarityResult {
  score: number; // 0-1 normalized score
  matchedTerms: string[]; // Keywords that matched
  reason: string; // Human-readable explanation
}

/**
 * Tokenize and normalize text for comparison
 */
export function tokenize(text: string): string[] {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\sąćęłńóśźżàâäéèêëïîôùûüç]/g, ' ') // Keep Polish and French chars
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 2)
    .filter(w => !STOP_WORDS.has(w));
}

/**
 * Calculate Jaccard similarity between two texts
 */
export function calculateTextSimilarity(text1: string, text2: string): SimilarityResult {
  const tokens1 = new Set(tokenize(text1));
  const tokens2 = new Set(tokenize(text2));

  if (tokens1.size === 0 || tokens2.size === 0) {
    return {
      score: 0,
      matchedTerms: [],
      reason: 'Empty text or no significant words',
    };
  }

  const intersection = [...tokens1].filter(t => tokens2.has(t));
  const union = new Set([...tokens1, ...tokens2]);

  const score = union.size > 0 ? intersection.length / union.size : 0;

  return {
    score,
    matchedTerms: intersection,
    reason:
      intersection.length > 0
        ? `Matching: ${intersection.slice(0, 3).join(', ')}${intersection.length > 3 ? '...' : ''}`
        : 'No matching terms',
  };
}

/**
 * Extract meeting-specific keywords for better matching
 */
export function extractMeetingKeywords(title: string): string[] {
  if (!title) return [];

  const lowerTitle = title.toLowerCase();
  const found: string[] = [];

  for (const keyword of MEETING_KEYWORDS) {
    if (lowerTitle.includes(keyword)) {
      found.push(keyword);
    }
  }

  // Also extract potential project/team names (capitalized words)
  const capitalizedWords = title.match(/[A-Z][a-z]+/g) || [];
  found.push(...capitalizedWords.map(w => w.toLowerCase()));

  return [...new Set(found)];
}

/**
 * Check if two meeting titles are likely the same recurring meeting
 */
export function isSameMeeting(title1: string, title2: string): boolean {
  const keywords1 = new Set(extractMeetingKeywords(title1));
  const keywords2 = new Set(extractMeetingKeywords(title2));

  if (keywords1.size === 0 || keywords2.size === 0) {
    // Fallback to basic similarity
    return calculateTextSimilarity(title1, title2).score > 0.6;
  }

  const intersection = [...keywords1].filter(k => keywords2.has(k));
  const minSize = Math.min(keywords1.size, keywords2.size);

  // At least 70% of keywords match
  return intersection.length / minSize >= 0.7;
}

/**
 * Normalize meeting title for pattern matching
 * Removes dates, times, and normalizes common variations
 */
export function normalizeMeetingTitle(title: string): string {
  if (!title) return '';

  return (
    title
      .toLowerCase()
      // Remove dates like "2024-01-15", "15.01", "Jan 15"
      .replace(/\d{4}[-/]\d{2}[-/]\d{2}/g, '')
      .replace(/\d{1,2}[./]\d{1,2}([./]\d{2,4})?/g, '')
      .replace(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d{1,2}/gi, '')
      // Remove times like "10:00", "10am"
      .replace(/\d{1,2}:\d{2}(:\d{2})?(\s*(am|pm))?/gi, '')
      .replace(/\d{1,2}\s*(am|pm)/gi, '')
      // Remove common suffixes
      .replace(/\s*[-–]\s*(call|meeting|sync|check-in)$/i, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Calculate weighted similarity with meeting-specific bonuses
 */
export function calculateMeetingSimilarity(
  meetingTitle: string,
  worklogDescription: string
): SimilarityResult {
  const baseSimilarity = calculateTextSimilarity(meetingTitle, worklogDescription);

  // Extract and compare meeting keywords
  const meetingKeywords = extractMeetingKeywords(meetingTitle);
  const worklogKeywords = extractMeetingKeywords(worklogDescription);

  const keywordMatches = meetingKeywords.filter(
    k => worklogKeywords.includes(k) || worklogDescription.toLowerCase().includes(k)
  );

  // Bonus for matching meeting keywords
  const keywordBonus = keywordMatches.length > 0 ? Math.min(0.3, keywordMatches.length * 0.1) : 0;

  // Bonus for matching normalized patterns
  const normalizedMeeting = normalizeMeetingTitle(meetingTitle);
  const normalizedWorklog = normalizeMeetingTitle(worklogDescription);
  const normalizedSimilarity = calculateTextSimilarity(normalizedMeeting, normalizedWorklog);

  const patternBonus = normalizedSimilarity.score > 0.5 ? 0.2 : 0;

  const finalScore = Math.min(1, baseSimilarity.score + keywordBonus + patternBonus);

  return {
    score: finalScore,
    matchedTerms: [...baseSimilarity.matchedTerms, ...keywordMatches],
    reason:
      keywordMatches.length > 0
        ? `Meeting keywords: ${keywordMatches.join(', ')}`
        : baseSimilarity.reason,
  };
}
