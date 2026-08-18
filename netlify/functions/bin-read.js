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
  
  if (!binId) {
    return new Response(JSON.stringify({ error: 'Missing binId parameter' }), { status: 400 });
  }

  const VALID = ['votes', 'comments', 'questions'];
  if (!VALID.includes(binId)) {
    return new Response(JSON.stringify({ error: `Unknown binId: ${binId}` }), { status: 400 });
  }

  try {
    const store = getStore({ name: 'cq-review', consistency: 'strong' });
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
