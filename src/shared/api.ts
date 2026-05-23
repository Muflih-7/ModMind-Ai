// ModMind AI — Shared Types v2

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type FlaggedItem = {
  id: string;
  type: 'post' | 'comment';
  author: string;
  content: string;
  permalink: string;
  score: number;
  severity: Severity;
  reasons: string[];
  explanation?: string;
  matchedPatterns?: string[];
  timestamp: number;
  status: 'pending' | 'approved' | 'removed';
};

export type SubredditStats = {
  totalFlagged: number;
  totalApproved: number;
  totalRemoved: number;
  pendingCount: number;
  topOffenses: { label: string; count: number }[];
};

export type ModAction = {
  action: 'approve' | 'remove' | 'ignore';
  itemId: string;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};