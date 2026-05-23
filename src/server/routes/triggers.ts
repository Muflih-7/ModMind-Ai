// ModMind AI — Triggers

import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import type {
  OnAppInstallRequest,
  OnPostSubmitRequest,
  OnCommentSubmitRequest,
  TriggerResponse
} from '@devvit/web/shared';
import { createPost } from '../core/post';

export const triggers = new Hono();

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

function analyzeContent(content: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const lower = content.toLowerCase();

  const foundKeywords = TOXIC_KEYWORDS.filter(kw => lower.includes(kw));
  if (foundKeywords.length > 0) {
    score += foundKeywords.length * 15;
    reasons.push(`Toxic keywords detected: ${foundKeywords.slice(0, 3).join(', ')}`);
  }

  const foundSpam = SPAM_PATTERNS.filter(p => p.test(content));
  if (foundSpam.length > 0) {
    score += foundSpam.length * 20;
    reasons.push('Spam patterns detected');
  }

  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (capsRatio > 0.6 && content.length > 20) {
    score += 10;
    reasons.push('Excessive caps usage');
  }

  if (/(.)\1{4,}/.test(content)) {
    score += 10;
    reasons.push('Repeated character spam');
  }

  return { score: Math.min(score, 100), reasons };
}

function getSeverity(score: number) {
  if (score >= 70) return 'critical';
  if (score >= 45) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

async function flagItem(id: string, type: 'post' | 'comment', author: string, content: string, permalink: string, score: number, reasons: string[]) {
  try {
    const raw = await redis.get('flagged_items');
    const items = raw ? JSON.parse(raw) : [];
    if (items.find((i: any) => i.id === id)) return;
    items.push({
      id, type, author,
      content: content.slice(0, 300),
      permalink, score,
      severity: getSeverity(score),
      reasons,
      timestamp: Date.now(),
      status: 'pending',
    });
    const trimmed = items.slice(-100);
    await redis.set('flagged_items', JSON.stringify(trimmed));
    const stats = {
      totalFlagged: trimmed.length,
      totalApproved: trimmed.filter((i: any) => i.status === 'approved').length,
      totalRemoved: trimmed.filter((i: any) => i.status === 'removed').length,
      pendingCount: trimmed.filter((i: any) => i.status === 'pending').length,
      topOffenses: [],
    };
    await redis.set('stats', JSON.stringify(stats));
  } catch (e) {
    console.error('Error flagging item:', e);
  }
}

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createPost();
    const input = await c.req.json<OnAppInstallRequest>();
    return c.json<TriggerResponse>({ status: 'success', message: `ModMind AI activated! Post: ${post.id}` }, 200);
  } catch (error) {
    return c.json<TriggerResponse>({ status: 'error', message: 'Failed to initialize' }, 400);
  }
});

triggers.post('/on-post-submit', async (c) => {
  try {
    const input = await c.req.json<OnPostSubmitRequest>();
    const post = input.post;
    if (!post) return c.json<TriggerResponse>({ status: 'success', message: 'No post data' }, 200);
    const content = `${post.title || ''} ${post.selftext || ''}`.trim();
    const { score, reasons } = analyzeContent(content);
    if (score >= 20) {
      await flagItem(post.id, 'post', post.author_name || 'unknown', content, `https://reddit.com${post.permalink || ''}`, score, reasons);
    }
    return c.json<TriggerResponse>({ status: 'success', message: `Analyzed. Score: ${score}` }, 200);
  } catch (error) {
    return c.json<TriggerResponse>({ status: 'error', message: 'Analysis failed' }, 400);
  }
});

triggers.post('/on-comment-submit', async (c) => {
  try {
    const input = await c.req.json<OnCommentSubmitRequest>();
    const comment = input.comment;
    if (!comment) return c.json<TriggerResponse>({ status: 'success', message: 'No comment data' }, 200);
    const content = comment.body || '';
    const { score, reasons } = analyzeContent(content);
    if (score >= 20) {
      await flagItem(comment.id, 'comment', comment.author_name || 'unknown', content, `https://reddit.com${comment.permalink || ''}`, score, reasons);
    }
    return c.json<TriggerResponse>({ status: 'success', message: `Analyzed. Score: ${score}` }, 200);
  } catch (error) {
    return c.json<TriggerResponse>({ status: 'error', message: 'Analysis failed' }, 400);
  }
});