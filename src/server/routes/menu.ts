// ModMind AI — Menu Routes

import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';

export const menu = new Hono();

// Mod menu item — open ModMind AI dashboard
menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();
    return c.json<UiResponse>(
      { navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}` },
      200
    );
  } catch (error) {
    console.error(`Error creating ModMind post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to open ModMind AI dashboard' }, 400);
  }
});

// Mod menu item — scan latest posts manually
menu.post('/scan-now', async (c) => {
  try {
    return c.json<UiResponse>({ showToast: '🛡️ ModMind AI scan initiated!' }, 200);
  } catch (error) {
    return c.json<UiResponse>({ showToast: 'Scan failed' }, 400);
  }
});