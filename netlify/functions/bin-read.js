/**
 * GET /api/bin-read?binId=<votes|comments|questions>
 *
 * Reads a value from Netlify Blobs.
 * No external service or credentials needed.
 */
import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const url = new URL(req.url);
  const binId = url.searchParams.get('binId');
  const version = parseInt(url.searchParams.get('version') || '1', 10);
  
  if (!binId) {
    return new Response(JSON.stringify({ error: 'Missing binId parameter' }), { status: 400 });
  }

  const VALID = ['votes', 'comments', 'questions', 'metadata'];
  if (!VALID.includes(binId)) {
    return new Response(JSON.stringify({ error: `Unknown binId: ${binId}` }), { status: 400 });
  }

  try {
    // Version 1 uses the original 'cq-review' store to preserve existing data.
    // metadata is always stored in the root 'cq-review' store regardless of version.
    const storeName = (binId === 'metadata' || version === 1) ? 'cq-review' : `cq-review-v${version}`;
    const store = getStore({ name: storeName, consistency: 'strong' });
    const value = await store.get(binId, { type: 'json' });
    const record = value ?? (binId === 'questions' ? [] : {});
    
    return new Response(JSON.stringify({ record }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Blob read failed', detail: err.message }), { status: 502 });
  }
};
