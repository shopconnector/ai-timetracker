// Task History - localStorage-based history of task usage
// Tracks which tasks were used for which activities

const STORAGE_KEY = 'timetracker_task_history';
const PROJECT_MAPPINGS_KEY = 'timetracker_project_mappings';
const SUGGESTION_FEEDBACK_KEY = 'timetracker_suggestion_feedback';
const MAX_HISTORY_ITEMS = 100;
const MAX_FEEDBACK_ITEMS = 500;

export interface TaskUsage {
  key: string;           // Jira ticket key (e.g., "BCI-395")
  name: string;          // Ticket name/summary
  lastUsed: string;      // ISO date of last use
  useCount: number;      // How many times this task was used
  activities: string[];  // Activity titles that were logged to this task
  projects: string[];    // Projects that were logged to this task
}

export interface ProjectMapping {
  project: string;       // Project name (folder name from VS Code)
  taskKey: string;       // Preferred Jira task for this project
  taskName: string;      // Task name for display
  confidence: number;    // How confident are we (0-1)
  usageCount: number;    // How many times this mapping was used
}

// Feedback for AI suggestions
export interface SuggestionFeedback {
  id: string;            // Unique feedback ID
  activityTitle: string; // Activity that was suggested for
  activityApp: string;   // App name
  project?: string;      // Project if available
  suggestedTicket: string; // What AI suggested
  actualTicket?: string;   // What user actually chose (if different)
  isPositive: boolean;     // 👍 or 👎
  timestamp: string;       // When feedback was given
  source: 'llm' | 'history' | 'project_mapping'; // Where suggestion came from
}

// Get all task history from localStorage
export function getTaskHistory(): TaskUsage[] {
  if (typeof window === 'undefined') return [];

  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Save task history to localStorage
function saveTaskHistory(history: TaskUsage[]): void {
  if (typeof window === 'undefined') return;

  // Limit history size
  const limited = history
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
    .slice(0, MAX_HISTORY_ITEMS);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
}

// Record a task usage
export function recordTaskUsage(
  taskKey: string,
  taskName: string,
  activityTitle: string,
  project?: string
): void {
  const history = getTaskHistory();
  const now = new Date().toISOString();

  // Find existing entry or create new
  let entry = history.find(h => h.key === taskKey);

  if (entry) {
    entry.lastUsed = now;
    entry.useCount++;

    // Add activity if not already present (limit to 10 recent)
    if (!entry.activities.includes(activityTitle)) {
      entry.activities = [activityTitle, ...entry.activities].slice(0, 10);
    }

    // Add project if not already present
    if (project && !entry.projects.includes(project)) {
      entry.projects = [project, ...entry.projects].slice(0, 10);
    }
  } else {
    entry = {
      key: taskKey,
      name: taskName,
      lastUsed: now,
      useCount: 1,
      activities: [activityTitle],
      projects: project ? [project] : []
    };
    history.push(entry);
  }

  saveTaskHistory(history);

  // Also update project mapping if project is provided
  if (project) {
    updateProjectMapping(project, taskKey, taskName);
  }
}

// Get recently used tasks (sorted by last use)
export function getRecentTasks(limit: number = 10): TaskUsage[] {
  return getTaskHistory()
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
    .slice(0, limit);
}

// Get most frequently used tasks
export function getMostUsedTasks(limit: number = 10): TaskUsage[] {
  return getTaskHistory()
    .sort((a, b) => b.useCount - a.useCount)
    .slice(0, limit);
}

// Get tasks that were used for similar activities
export function getTasksForActivity(activityTitle: string): TaskUsage[] {
  const titleLower = activityTitle.toLowerCase();
  const words = titleLower.split(/\s+/).filter(w => w.length > 3);

  return getTaskHistory()
    .filter(task => {
      // Check if any activity matches
      return task.activities.some(a => {
        const actLower = a.toLowerCase();
        // Check for word overlap
        return words.some(word => actLower.includes(word));
      });
    })
    .sort((a, b) => b.useCount - a.useCount);
}

// Get tasks for a specific project
export function getTasksForProject(project: string): TaskUsage[] {
  return getTaskHistory()
    .filter(task => task.projects.includes(project))
    .sort((a, b) => b.useCount - a.useCount);
}

// --- Project Mappings ---

// Get all project mappings
export function getProjectMappings(): ProjectMapping[] {
  if (typeof window === 'undefined') return [];

  try {
    const data = localStorage.getItem(PROJECT_MAPPINGS_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Save project mappings
function saveProjectMappings(mappings: ProjectMapping[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PROJECT_MAPPINGS_KEY, JSON.stringify(mappings));
}

// Update or create project mapping
export function updateProjectMapping(
  project: string,
  taskKey: string,
  taskName: string
): void {
  const mappings = getProjectMappings();
  let mapping = mappings.find(m => m.project === project);

  if (mapping) {
    // If same task - increase confidence
    if (mapping.taskKey === taskKey) {
      mapping.usageCount++;
      mapping.confidence = Math.min(1, mapping.confidence + 0.1);
    } else {
      // Different task - decide if we should switch
      // Only switch if new task has more usage for this project
      const currentUsage = mapping.usageCount;
      const history = getTaskHistory();
      const taskHistory = history.find(h => h.key === taskKey);
      const newTaskProjectUsage = taskHistory?.projects.filter(p => p === project).length || 0;

      if (newTaskProjectUsage > currentUsage) {
        mapping.taskKey = taskKey;
        mapping.taskName = taskName;
        mapping.usageCount = 1;
        mapping.confidence = 0.5;
      } else {
        // Keep current but reduce confidence slightly
        mapping.confidence = Math.max(0.3, mapping.confidence - 0.05);
      }
    }
  } else {
    // New mapping
    mapping = {
      project,
      taskKey,
      taskName,
      confidence: 0.5,
      usageCount: 1
    };
    mappings.push(mapping);
  }

  saveProjectMappings(mappings);
}

// Get suggested task for a project
export function getSuggestedTaskForProject(project: string): ProjectMapping | undefined {
  const mappings = getProjectMappings();
  return mappings.find(m => m.project === project && m.confidence >= 0.5);
}

// Manually set project mapping (from settings page)
export function setProjectMapping(
  project: string,
  taskKey: string,
  taskName: string
): void {
  const mappings = getProjectMappings();
  const index = mappings.findIndex(m => m.project === project);

  const newMapping: ProjectMapping = {
    project,
    taskKey,
    taskName,
    confidence: 1.0, // Manual mapping = max confidence
    usageCount: 1
  };

  if (index >= 0) {
    mappings[index] = newMapping;
  } else {
    mappings.push(newMapping);
  }

  saveProjectMappings(mappings);
}

// Delete project mapping
export function deleteProjectMapping(project: string): void {
  const mappings = getProjectMappings().filter(m => m.project !== project);
  saveProjectMappings(mappings);
}

// --- Suggestion Feedback ---

// Get all suggestion feedback
export function getSuggestionFeedback(): SuggestionFeedback[] {
  if (typeof window === 'undefined') return [];

  try {
    const data = localStorage.getItem(SUGGESTION_FEEDBACK_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Save suggestion feedback
function saveSuggestionFeedback(feedback: SuggestionFeedback[]): void {
  if (typeof window === 'undefined') return;

  // Limit size and keep most recent
  const limited = feedback
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_FEEDBACK_ITEMS);

  localStorage.setItem(SUGGESTION_FEEDBACK_KEY, JSON.stringify(limited));
}

// Record feedback for a suggestion
export function recordSuggestionFeedback(
  activityTitle: string,
  activityApp: string,
  suggestedTicket: string,
  isPositive: boolean,
  source: 'llm' | 'history' | 'project_mapping',
  project?: string,
  actualTicket?: string
): void {
  const feedback = getSuggestionFeedback();

  const newFeedback: SuggestionFeedback = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    activityTitle,
    activityApp,
    project,
    suggestedTicket,
    actualTicket,
    isPositive,
    timestamp: new Date().toISOString(),
    source
  };

  feedback.push(newFeedback);
  saveSuggestionFeedback(feedback);

  // If negative feedback, decrease confidence for this mapping
  if (!isPositive && project) {
    decreaseProjectMappingConfidence(project, suggestedTicket);
  }

  // If positive feedback, increase confidence
  if (isPositive && project) {
    increaseProjectMappingConfidence(project, suggestedTicket);
  }
}

// Decrease confidence for a project mapping based on negative feedback
function decreaseProjectMappingConfidence(project: string, taskKey: string): void {
  const mappings = getProjectMappings();
  const mapping = mappings.find(m => m.project === project && m.taskKey === taskKey);

  if (mapping) {
    mapping.confidence = Math.max(0.1, mapping.confidence - 0.15);
    saveProjectMappings(mappings);
  }
}

// Increase confidence for a project mapping based on positive feedback
function increaseProjectMappingConfidence(project: string, taskKey: string): void {
  const mappings = getProjectMappings();
  const mapping = mappings.find(m => m.project === project && m.taskKey === taskKey);

  if (mapping) {
    mapping.confidence = Math.min(1.0, mapping.confidence + 0.1);
    mapping.usageCount++;
    saveProjectMappings(mappings);
  }
}

// Get feedback stats
export function getFeedbackStats(): {
  total: number;
  positive: number;
  negative: number;
  accuracy: number;
  bySource: Record<string, { positive: number; negative: number }>;
} {
  const feedback = getSuggestionFeedback();
  const positive = feedback.filter(f => f.isPositive).length;
  const negative = feedback.filter(f => !f.isPositive).length;

  const bySource: Record<string, { positive: number; negative: number }> = {};
  for (const f of feedback) {
    if (!bySource[f.source]) {
      bySource[f.source] = { positive: 0, negative: 0 };
    }
    if (f.isPositive) {
      bySource[f.source].positive++;
    } else {
      bySource[f.source].negative++;
    }
  }

  return {
    total: feedback.length,
    positive,
    negative,
    accuracy: feedback.length > 0 ? positive / feedback.length : 0,
    bySource
  };
}

// Get bad suggestions (frequently rejected)
export function getBadSuggestions(): Array<{
  pattern: string;
  suggestedTicket: string;
  rejectionCount: number;
}> {
  const feedback = getSuggestionFeedback();
  const negativeFeedback = feedback.filter(f => !f.isPositive);

  // Group by activity pattern + suggested ticket
  const patterns = new Map<string, { suggestedTicket: string; count: number }>();

  for (const f of negativeFeedback) {
    // Create pattern from app + first few words of title
    const titleWords = f.activityTitle.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
    const pattern = `${f.activityApp.toLowerCase()}:${titleWords}`;
    const key = `${pattern}::${f.suggestedTicket}`;

    if (patterns.has(key)) {
      patterns.get(key)!.count++;
    } else {
      patterns.set(key, { suggestedTicket: f.suggestedTicket, count: 1 });
    }
  }

  return Array.from(patterns.entries())
    .filter(([_, v]) => v.count >= 2) // Only patterns with 2+ rejections
    .map(([pattern, data]) => ({
      pattern: pattern.split('::')[0],
      suggestedTicket: data.suggestedTicket,
      rejectionCount: data.count
    }))
    .sort((a, b) => b.rejectionCount - a.rejectionCount);
}

// Check if a suggestion was previously rejected
export function wasSuggestionRejected(
  activityApp: string,
  activityTitle: string,
  suggestedTicket: string
): boolean {
  const badSuggestions = getBadSuggestions();
  const titleWords = activityTitle.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
  const pattern = `${activityApp.toLowerCase()}:${titleWords}`;

  return badSuggestions.some(
    bad => bad.pattern === pattern && bad.suggestedTicket === suggestedTicket
  );
}

// Clear all feedback
export function clearSuggestionFeedback(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SUGGESTION_FEEDBACK_KEY);
}

// --- Utility functions ---

// Clear all history (for settings page)
export function clearTaskHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// Clear all project mappings
export function clearProjectMappings(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PROJECT_MAPPINGS_KEY);
}

// Export history for backup
export function exportHistory(): string {
  return JSON.stringify({
    taskHistory: getTaskHistory(),
    projectMappings: getProjectMappings(),
    suggestionFeedback: getSuggestionFeedback(),
    exportedAt: new Date().toISOString()
  }, null, 2);
}

// Import history from backup
export function importHistory(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    if (parsed.taskHistory) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.taskHistory));
    }
    if (parsed.projectMappings) {
      localStorage.setItem(PROJECT_MAPPINGS_KEY, JSON.stringify(parsed.projectMappings));
    }
    if (parsed.suggestionFeedback) {
      localStorage.setItem(SUGGESTION_FEEDBACK_KEY, JSON.stringify(parsed.suggestionFeedback));
    }
    return true;
  } catch {
    return false;
  }
}

// Get smart suggestions combining history, project mappings, and activity matching
export interface SmartSuggestion {
  taskKey: string;
  taskName: string;
  confidence: number;
  reason: string;
  source: 'project_mapping' | 'activity_history' | 'recent_usage' | 'frequent_usage' | 'llm';
}

export function getSmartSuggestions(
  activityTitle: string,
  project?: string,
  limit: number = 5,
  activityApp?: string
): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];
  const badSuggestions = getBadSuggestions();

  // Helper to check if a suggestion was frequently rejected
  const isRejected = (taskKey: string): boolean => {
    if (!activityApp) return false;
    const titleWords = activityTitle.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
    const pattern = `${activityApp.toLowerCase()}:${titleWords}`;
    return badSuggestions.some(
      bad => bad.pattern === pattern && bad.suggestedTicket === taskKey && bad.rejectionCount >= 2
    );
  };

  // 1. Check project mapping first (highest priority)
  if (project) {
    const projectMapping = getSuggestedTaskForProject(project);
    if (projectMapping && !isRejected(projectMapping.taskKey)) {
      suggestions.push({
        taskKey: projectMapping.taskKey,
        taskName: projectMapping.taskName,
        confidence: projectMapping.confidence,
        reason: `Projekt "${project}" zwykle używa tego taska`,
        source: 'project_mapping'
      });
    }
  }

  // 2. Check activity history
  const activityMatches = getTasksForActivity(activityTitle);
  for (const match of activityMatches.slice(0, 3)) {
    if (!suggestions.some(s => s.taskKey === match.key) && !isRejected(match.key)) {
      suggestions.push({
        taskKey: match.key,
        taskName: match.name,
        confidence: Math.min(0.8, 0.4 + match.useCount * 0.1),
        reason: `Podobne aktywności były logowane do tego taska`,
        source: 'activity_history'
      });
    }
  }

  // 3. Add recent tasks
  const recentTasks = getRecentTasks(5);
  for (const task of recentTasks) {
    if (!suggestions.some(s => s.taskKey === task.key) && !isRejected(task.key)) {
      const daysSinceUse = (Date.now() - new Date(task.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
      suggestions.push({
        taskKey: task.key,
        taskName: task.name,
        confidence: Math.max(0.3, 0.6 - daysSinceUse * 0.05),
        reason: `Ostatnio używany`,
        source: 'recent_usage'
      });
    }
  }

  // Sort by confidence and limit
  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}
