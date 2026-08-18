/**
 * POST /api/bin-write
 *
 * Body (JSON): { binId: "votes"|"comments"|"questions", data: any }
 *
 * Writes a value to Netlify Blobs.
 * No external service or credentials needed.
 */
import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let binId, data, version;
  try {
    const body = await req.json();
    ({ binId, data, version } = body);
    version = parseInt(version || '1', 10);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!binId || data === undefined) {
    return new Response(JSON.stringify({ error: 'Missing binId or data' }), { status: 400 });
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
    await store.setJSON(binId, data);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Blob write failed', detail: err.message }), { status: 502 });
  }
};
