/**
 * POST /api/bin-write
 *
 * Body (JSON): { binId: "votes"|"comments"|"questions"|"modules", data: any, version?: number, moduleId?: string }
 *
 * Writes a value to Netlify Blobs.
 * No external service or credentials needed.
 */
import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let baseBinId, data, version, moduleId;
  try {
    const body = await req.json();
    ({ binId: baseBinId, data, version, moduleId } = body);
    version = parseInt(version || '1', 10);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!baseBinId || data === undefined) {
    return new Response(JSON.stringify({ error: 'Missing binId or data' }), { status: 400 });
  }

  const VALID = ['votes', 'comments', 'questions', 'modules'];
  if (!VALID.includes(baseBinId)) {
    return new Response(JSON.stringify({ error: `Unknown binId: ${baseBinId}` }), { status: 400 });
  }

  try {
    const store = getStore({ name: 'cq-review', consistency: 'strong' });
    let binKey;
    if (baseBinId === 'modules') {
      binKey = 'modules';
    } else {
      const prefix = moduleId ? `mod_${moduleId}_${baseBinId}` : baseBinId;
      binKey = version === 1 ? prefix : `${prefix}-v${version}`;
    }

    await store.setJSON(binKey, data);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Blob write failed', detail: err.message }), { status: 502 });
  }
};
