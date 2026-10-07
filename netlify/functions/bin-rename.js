/**
 * POST /api/bin-rename
 *
 * Body (JSON): { oldModuleId: string, newModuleId: string }
 *
 * Renames all blobs belonging to oldModuleId to newModuleId in Netlify Blobs.
 */
import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { oldModuleId, newModuleId } = await req.json();
    if (!oldModuleId || !newModuleId) {
      return new Response(JSON.stringify({ error: 'Missing oldModuleId or newModuleId' }), { status: 400 });
    }

    if (oldModuleId === newModuleId) {
      return new Response(JSON.stringify({ success: true, count: 0 }), { status: 200 });
    }

    const store = getStore({ name: 'cq-review', consistency: 'strong' });
    const oldPrefix = `mod_${oldModuleId}_`;
    const newPrefix = `mod_${newModuleId}_`;

    const { blobs } = await store.list({ prefix: oldPrefix });

    for (const blob of blobs) {
      const suffix = blob.key.slice(oldPrefix.length);
      const newKey = `${newPrefix}${suffix}`;
      const data = await store.get(blob.key);
      if (data !== null) {
        await store.set(newKey, data);
        await store.delete(blob.key);
      }
    }

    // If migrating from nutritional-intervention, also check legacy blobs
    if (oldModuleId === 'nutritional-intervention') {
      const legacyTypes = ['questions', 'votes', 'comments'];
      const { blobs: allBlobs } = await store.list();
      for (const b of allBlobs) {
        const isLegacy = legacyTypes.some(t => b.key === t || b.key.startsWith(`${t}-v`));
        if (isLegacy) {
          const newKey = `${newPrefix}${b.key}`;
          const existing = await store.get(newKey);
          if (existing === null) {
            const data = await store.get(b.key);
            if (data !== null) {
              await store.set(newKey, data);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, count: blobs.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Blob rename failed', detail: err.message }), { status: 502 });
  }
};
