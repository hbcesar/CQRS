/**
 * POST /api/bin-delete
 *
 * Body (JSON): { moduleId: string }
 *
 * Deletes all blobs belonging to a module from Netlify Blobs.
 */
import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { moduleId } = await req.json();
    if (!moduleId) {
      return new Response(JSON.stringify({ error: 'Missing moduleId' }), { status: 400 });
    }

    const store = getStore({ name: 'cq-review', consistency: 'strong' });
    const prefix = `mod_${moduleId}_`;
    const { blobs } = await store.list({ prefix });

    await Promise.all(blobs.map(blob => store.delete(blob.key)));

    return new Response(JSON.stringify({ success: true, deleted: blobs.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Blob delete failed', detail: err.message }), { status: 502 });
  }
};
