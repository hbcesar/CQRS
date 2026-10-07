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
    const { moduleId, aliases } = await req.json();
    if (!moduleId) {
      return new Response(JSON.stringify({ error: 'Missing moduleId' }), { status: 400 });
    }

    const store = getStore({ name: 'cq-review', consistency: 'strong' });
    const prefixes = [`mod_${moduleId}_`, ...(Array.isArray(aliases) ? aliases.map(a => `mod_${a}_`) : [])];
    let totalDeleted = 0;

    for (const prefix of prefixes) {
      const { blobs } = await store.list({ prefix });
      await Promise.all(blobs.map(blob => store.delete(blob.key)));
      totalDeleted += blobs.length;
    }

    return new Response(JSON.stringify({ success: true, deleted: totalDeleted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Blob delete failed', detail: err.message }), { status: 502 });
  }
};
