/**
 * POST /api/bin-write
 *
 * Body (JSON): { binId: "votes"|"comments"|"questions", data: any }
 *
 * Writes a value to Netlify Blobs.
 * No external service or credentials needed.
 */
import { getStore } from '@netlify/blobs';

export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let binId, data;
  try {
    ({ binId, data } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!binId || data === undefined) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing binId or data' }) };
  }

  const VALID = ['votes', 'comments', 'questions'];
  if (!VALID.includes(binId)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Unknown binId: ${binId}` }) };
  }

  try {
    const store = getStore({ name: 'cq-review', consistency: 'strong' });
    await store.setJSON(binId, data);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Blob write failed', detail: err.message })
    };
  }
}
