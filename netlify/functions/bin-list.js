/**
 * GET /api/bin-list
 *
 * Scans the 'cq-review' Netlify Blobs store for 'questions' blobs
 * and returns the available versions.
 */
import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const store = getStore({ name: 'cq-review', consistency: 'strong' });
    
    // List all blobs starting with 'questions'
    const { blobs } = await store.list({ prefix: 'questions' });
    
    // Parse versions from keys
    // keys are either 'questions' (v1) or 'questions-vN' (vN)
    const versions = blobs.map(blob => {
      if (blob.key === 'questions') return 1;
      const match = blob.key.match(/^questions-v(\d+)$/);
      if (match) return parseInt(match[1], 10);
      return null;
    }).filter(v => v !== null).sort((a, b) => a - b);
    
    // If store is completely empty, default to [1]
    if (versions.length === 0) {
      versions.push(1);
    }
    
    return new Response(JSON.stringify({ versions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
