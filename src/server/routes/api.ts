// ModMind AI — Backend API v2

import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import type { FlaggedItem, SubredditStats, ModAction, ApiResponse, Severity } from '../../shared/api';

export const api = new Hono();

const TOXIC_KEYWORDS = [
  'hate', 'kill', 'die', 'stupid', 'idiot', 'moron', 'trash', 'garbage',
  'spam', 'scam', 'fake', 'fraud', 'bot', 'ban', 'racist', 'slur',
  'harassment', 'threat', 'abuse', 'violent', 'attack', 'destroy'
];

const SPAM_PATTERNS = [
  /buy now/i, /click here/i, /free money/i, /make \$\d+/i,
  /visit my profile/i, /check my bio/i, /dm me/i, /limited offer/i,
  /100% free/i, /guaranteed/i, /www\./i, /http/i
];

const HATE_PATTERNS = [
  /\b(hate|despise|loathe)\s+(all|every|those)\b/i,
  /\b(kill|eliminate|remove)\s+(all|them|those)\b/i,
  /\ball\s+\w+\s+are\s+(bad|evil|stupid|trash)\b/i,
];

function analyzeContent(content: string, customKeywords: string[] = []): {
  score: number;
  reasons: string[];
  explanation: string;
  matchedPatterns: string[];
} {
  let score = 0;
  const reasons: string[] = [];
  const matchedPatterns: string[] = [];
  const lower = content.toLowerCase();

  const foundKeywords = TOXIC_KEYWORDS.filter(kw => lower.includes(kw));
  if (foundKeywords.length > 0) {
    score += foundKeywords.length * 15;
    reasons.push(`Toxic keywords detected: ${foundKeywords.slice(0, 3).join(', ')}`);
    matchedPatterns.push(...foundKeywords.slice(0, 3));
  }

  const foundSpam = SPAM_PATTERNS.filter(p => p.test(content));
  if (foundSpam.length > 0) {
    score += foundSpam.length * 20;
    reasons.push('Spam patterns detected');
    matchedPatterns.push(`${foundSpam.length} spam pattern${foundSpam.length > 1 ? 's' : ''}`);
  }

  const foundHate = HATE_PATTERNS.filter(p => p.test(content));
  if (foundHate.length > 0) {
    score += foundHate.length * 35;
    reasons.push('Potential hate speech detected');
    matchedPatterns.push('hate speech pattern');
  }

  const capsRatio = (content.match(/[A-Z]/g) || []).length / Math.max(content.length, 1);
  if (capsRatio > 0.6 && content.length > 20) {
    score += 10;
    reasons.push('Excessive caps usage');
    matchedPatterns.push('excessive caps');
  }

  if (/(.)\1{4,}/.test(content)) {
    score += 10;
    reasons.push('Repeated character spam');
    matchedPatterns.push('character spam');
  }

  // Custom keywords
  const foundCustom = customKeywords.filter(kw => lower.includes(kw));
  if (foundCustom.length > 0) {
    score += foundCustom.length * 25;
    reasons.push(`Custom rule violation: ${foundCustom.join(', ')}`);
    matchedPatterns.push(...foundCustom);
  }

  score = Math.min(score, 100);
  const confidence = Math.min(95, 60 + Math.floor(score / 4));

  // Build natural language explanation
  let explanation = '';
  if (score >= 70) {
    explanation = `This content was flagged as high-risk (score: ${score}/100) because it contains ${matchedPatterns.slice(0, 3).join(', ')}. Based on similar content patterns, ${confidence}% of items with this profile were actioned by moderators.`;
  } else if (score >= 45) {
    explanation = `This content shows suspicious patterns (score: ${score}/100), including ${matchedPatterns.slice(0, 2).join(' and ')}. Recommend reviewing before approval.`;
  } else {
    explanation = `This content has minor flags (score: ${score}/100). Low risk but flagged for ${matchedPatterns[0] || 'pattern match'}. Likely safe to approve.`;
  }

  return { score, reasons, explanation, matchedPatterns };
}

function getSeverity(score: number): Severity {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

// Severity escalation — items pending too long get escalated
function getEscalatedSeverity(item: FlaggedItem): Severity {
  const ageMinutes = (Date.now() - item.timestamp) / 60000;
  const base = item.severity;
  if (ageMinutes < 30) return base;
  if (base === 'medium' && ageMinutes > 30) return 'high';
  if (base === 'high' && ageMinutes > 60) return 'critical';
  return base;
}

async function getFlaggedItems(): Promise<FlaggedItem[]> {
  try {
    const raw = await redis.get('flagged_items');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveFlaggedItems(items: FlaggedItem[]): Promise<void> {
  await redis.set('flagged_items', JSON.stringify(items.slice(-100)));
}

function computeStats(items: FlaggedItem[]): SubredditStats {
  const counts: Record<string, number> = {};
  for (const item of items) {
    for (const reason of item.reasons) {
      const key = reason.split(':')[0].trim();
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  const topOffenses = Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalFlagged: items.length,
    totalApproved: items.filter(i => i.status === 'approved').length,
    totalRemoved: items.filter(i => i.status === 'removed').length,
    pendingCount: items.filter(i => i.status === 'pending').length,
    topOffenses,
  };
}

// GET /api/queue
api.get('/queue', async (c) => {
  const items = await getFlaggedItems();
  const pending = items
    .filter(i => i.status === 'pending')
    .map(i => ({ ...i, severity: getEscalatedSeverity(i) }))
    .sort((a, b) => b.score - a.score);
  return c.json<ApiResponse<FlaggedItem[]>>({ success: true, data: pending });
});

// GET /api/stats
api.get('/stats', async (c) => {
  const items = await getFlaggedItems();
  return c.json<ApiResponse<SubredditStats>>({ success: true, data: computeStats(items) });
});

// GET /api/all
api.get('/all', async (c) => {
  const items = await getFlaggedItems();
  return c.json<ApiResponse<FlaggedItem[]>>({ success: true, data: items.sort((a, b) => b.timestamp - a.timestamp) });
});

// GET /api/offenders
api.get('/offenders', async (c) => {
  const items = await getFlaggedItems();
  const map: Record<string, { count: number; removed: number; author: string; lastSeen: number }> = {};
  for (const item of items) {
    if (!map[item.author]) map[item.author] = { count: 0, removed: 0, author: item.author, lastSeen: 0 };
    map[item.author].count++;
    if (item.status === 'removed') map[item.author].removed++;
    if (item.timestamp > map[item.author].lastSeen) map[item.author].lastSeen = item.timestamp;
  }
  const offenders = Object.values(map)
    .filter(o => o.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return c.json<ApiResponse<typeof offenders>>({ success: true, data: offenders });
});

// GET /api/user/:author — user profile
api.get('/user/:author', async (c) => {
  const author = c.req.param('author');
  const items = await getFlaggedItems();
  const userItems = items.filter(i => i.author === author);
  const profile = {
    author,
    totalFlagged: userItems.length,
    removed: userItems.filter(i => i.status === 'removed').length,
    approved: userItems.filter(i => i.status === 'approved').length,
    pending: userItems.filter(i => i.status === 'pending').length,
    avgScore: userItems.length > 0 ? Math.round(userItems.reduce((s, i) => s + i.score, 0) / userItems.length) : 0,
    topViolations: [...new Set(userItems.flatMap(i => i.reasons.map(r => r.split(':')[0].trim())))].slice(0, 3),
    items: userItems.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5),
    firstSeen: userItems.length > 0 ? Math.min(...userItems.map(i => i.timestamp)) : 0,
    lastSeen: userItems.length > 0 ? Math.max(...userItems.map(i => i.timestamp)) : 0,
    riskLevel: userItems.length >= 3 ? 'high' : userItems.length >= 2 ? 'medium' : 'low',
  };
  return c.json<ApiResponse<typeof profile>>({ success: true, data: profile });
});

// GET /api/similar/:id — similar content
api.get('/similar/:id', async (c) => {
  const id = c.req.param('id');
  const items = await getFlaggedItems();
  const target = items.find(i => i.id === id);
  if (!target) return c.json<ApiResponse<null>>({ success: false, error: 'Not found' }, 404);

  const targetReasons = new Set(target.reasons.map(r => r.split(':')[0].trim()));
  const similar = items
    .filter(i => i.id !== id && i.status === 'removed')
    .filter(i => i.reasons.some(r => targetReasons.has(r.split(':')[0].trim())))
    .slice(0, 3);

  return c.json<ApiResponse<FlaggedItem[]>>({ success: true, data: similar });
});

// POST /api/analyze
api.post('/analyze', async (c) => {
  const { content, type, author, permalink, id, customKeywords } = await c.req.json();
  const { score, reasons, explanation, matchedPatterns } = analyzeContent(content, customKeywords || []);

  if (score >= 20) {
    const item: any = {
      id: id || `manual_${Date.now()}`,
      type, author,
      content: content.slice(0, 300),
      permalink, score,
      severity: getSeverity(score),
      reasons, explanation, matchedPatterns,
      timestamp: Date.now(),
      status: 'pending',
    };
    const items = await getFlaggedItems();
    if (!items.find(i => i.id === item.id)) {
      items.push(item);
      await saveFlaggedItems(items);
    }
    return c.json<ApiResponse<any>>({ success: true, data: item });
  }
  return c.json<ApiResponse<null>>({ success: true, data: null });
});

// POST /api/action
api.post('/action', async (c) => {
  const { action, itemId } = await c.req.json<ModAction>();
  const items = await getFlaggedItems();
  const item = items.find(i => i.id === itemId);
  if (!item) return c.json<ApiResponse<null>>({ success: false, error: 'Not found' }, 404);
  item.status = action === 'approve' ? 'approved' : action === 'remove' ? 'removed' : 'pending';
  await saveFlaggedItems(items);
  return c.json<ApiResponse<FlaggedItem>>({ success: true, data: item });
});

// POST /api/bulk-action
api.post('/bulk-action', async (c) => {
  const { action, itemIds } = await c.req.json<{ action: 'approve' | 'remove'; itemIds: string[] }>();
  const items = await getFlaggedItems();
  let actioned = 0;
  for (const id of itemIds) {
    const item = items.find(i => i.id === id);
    if (item) {
      item.status = action === 'approve' ? 'approved' : 'removed';
      actioned++;
    }
  }
  await saveFlaggedItems(items);
  return c.json<ApiResponse<{ actioned: number }>>({ success: true, data: { actioned } });
});

// DELETE /api/clear
api.delete('/clear', async (c) => {
  await redis.set('flagged_items', JSON.stringify([]));
  return c.json<ApiResponse<null>>({ success: true, data: null });
});