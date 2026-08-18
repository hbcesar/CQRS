/**
 * GET /api/bin-read?binId=<votes|comments|questions>
 *
 * Reads a value from Netlify Blobs.
 * No external service or credentials needed.
 */
import { getStore } from '@netlify/blobs';

export async function handler(event, context) {
  const binId = event.queryStringParameters?.binId;
  if (!binId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing binId parameter' }) };
  }

  const VALID = ['votes', 'comments', 'questions'];
  if (!VALID.includes(binId)) {
    return { statusCode: 400, body: JSON.stringify({ error: `Unknown binId: ${binId}` }) };
  }

  try {
    const store  = getStore({ name: 'cq-review', consistency: 'strong' });
    const value  = await store.get(binId, { type: 'json' });
    // Return null-safe default depending on type
    const record = value ?? (binId === 'questions' ? [] : {});
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record })
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Blob read failed', detail: err.message })
    };
  }
}
