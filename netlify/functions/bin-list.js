/**
 * GET /api/bin-list?moduleId=<id>
 *
 * Scans the 'cq-review' Netlify Blobs store for 'questions' blobs
 * and returns the available versions for the given module (or default).
 */
import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const store = getStore({ name: 'cq-review', consistency: 'strong' });
    const url = new URL(req.url);
    const moduleId = url.searchParams.get('moduleId');

    let versions = [];
    if (moduleId) {
      const prefix = `mod_${moduleId}_questions`;
      const { blobs } = await store.list({ prefix });
      const versionRegex = new RegExp(`^${prefix}-v(\\d+)$`);

      versions = blobs.map(blob => {
        if (blob.key === prefix) return 1;
        const match = blob.key.match(versionRegex);
        if (match) return parseInt(match[1], 10);
        return null;
      }).filter(v => v !== null).sort((a, b) => a - b);

      // If nutritional-intervention and no mod_* blobs found, check legacy blobs
      if (versions.length === 0 && moduleId === 'nutritional-intervention') {
        const legacyList = await store.list({ prefix: 'questions' });
        const legacyVersions = legacyList.blobs.map(blob => {
          if (blob.key === 'questions') return 1;
          const match = blob.key.match(/^questions-v(\d+)$/);
          if (match) return parseInt(match[1], 10);
          return null;
        }).filter(v => v !== null).sort((a, b) => a - b);

        if (legacyVersions.length > 0) {
          versions = legacyVersions;
        }
      }
    } else {
      const { blobs } = await store.list({ prefix: 'questions' });
      versions = blobs.map(blob => {
        if (blob.key === 'questions') return 1;
        const match = blob.key.match(/^questions-v(\d+)$/);
        if (match) return parseInt(match[1], 10);
        return null;
      }).filter(v => v !== null).sort((a, b) => a - b);
    }

    // If store is completely empty, default to [1]
    if (versions.length === 0) {
      versions.push(1);
    }

    return new Response(JSON.stringify({ versions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ versions: [1], error: err.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
