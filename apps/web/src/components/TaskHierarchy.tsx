'use client';

import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, FolderOpen, FileText } from 'lucide-react';
import { useState } from 'react';

export interface HierarchicalIssue {
  key: string;
  name: string;
  project: string;
  status: string;
  type?: string;
  isSubtask?: boolean;
  parentKey?: string | null;
  parentSummary?: string | null;
}

export interface IssueGroup {
  parentKey: string | null;
  parentSummary: string | null;
  parentStatus: string | null;
  issues: HierarchicalIssue[];
}

interface TaskHierarchyProps {
  groups: IssueGroup[];
  selectedTicket?: string;
  onSelectTicket: (ticket: HierarchicalIssue) => void;
}

export function TaskHierarchy({ groups, selectedTicket, onSelectTicket }: TaskHierarchyProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('progress')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    if (statusLower.includes('done') || statusLower.includes('closed')) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    if (statusLower.includes('review')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  };

  return (
    <div className="space-y-2">
      {groups.map((group, idx) => {
        const groupKey = group.parentKey || `orphan-${idx}`;
        const isExpanded = expandedGroups.has(groupKey);
        const hasMultipleIssues = group.issues.length > 1;
        const isParentGroup = group.parentKey !== null;

        if (!isParentGroup || !hasMultipleIssues) {
          // Pojedyncze zadanie bez hierarchii
          const issue = group.issues[0];
          if (!issue) return null;

          return (
            <div
              key={issue.key}
              onClick={() => onSelectTicket(issue)}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                selectedTicket === issue.key
                  ? 'bg-blue-50 border-2 border-blue-500 dark:bg-blue-900/20'
                  : 'bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-400" />
                <span className="font-mono text-sm font-medium">{issue.key}</span>
                <Badge className={getStatusColor(issue.status)} variant="secondary">
                  {issue.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 truncate">
                {issue.name}
              </p>
            </div>
          );
        }

        // Grupa z hierarchią (parent + subtaski)
        return (
          <div key={groupKey} className="border rounded-lg dark:border-gray-700">
            {/* Parent header */}
            <div
              onClick={() => toggleGroup(groupKey)}
              className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-t-lg"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
              <FolderOpen className="h-4 w-4 text-amber-500" />
              <span className="font-mono text-sm font-medium">{group.parentKey}</span>
              {group.parentStatus && (
                <Badge className={getStatusColor(group.parentStatus)} variant="secondary">
                  {group.parentStatus}
                </Badge>
              )}
              <Badge variant="outline" className="ml-auto">
                {group.issues.length} tasks
              </Badge>
            </div>
            <p className="px-3 pb-2 text-sm text-gray-600 dark:text-gray-400 truncate">
              {group.parentSummary}
            </p>

            {/* Subtasks */}
            {isExpanded && (
              <div className="border-t dark:border-gray-700">
                {group.issues.map((issue) => (
                  <div
                    key={issue.key}
                    onClick={() => onSelectTicket(issue)}
                    className={`flex items-center gap-2 p-3 pl-8 cursor-pointer transition-colors ${
                      selectedTicket === issue.key
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="text-gray-300 dark:text-gray-600">└─</span>
                    <FileText className="h-3 w-3 text-gray-400" />
                    <span className="font-mono text-xs">{issue.key}</span>
                    <Badge className={`${getStatusColor(issue.status)} text-xs`} variant="secondary">
                      {issue.status}
                    </Badge>
                    <span className="text-sm text-gray-600 dark:text-gray-400 truncate flex-1">
                      {issue.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {groups.length === 0 && (
        <p className="text-center text-gray-500 py-8">
          Brak zadań do wyświetlenia
        </p>
      )}
    </div>
  );
}
