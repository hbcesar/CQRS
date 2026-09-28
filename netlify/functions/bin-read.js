/**
 * GET /api/bin-read?binId=<votes|comments|questions|modules>&version=<N>&moduleId=<id>
 *
 * Reads a value from Netlify Blobs.
 * No external service or credentials needed.
 */
import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const url = new URL(req.url);
  const baseBinId = url.searchParams.get('binId');
  const version = parseInt(url.searchParams.get('version') || '1', 10);
  const moduleId = url.searchParams.get('moduleId');
  
  if (!baseBinId) {
    return new Response(JSON.stringify({ error: 'Missing binId parameter' }), { status: 400 });
  }

  const VALID = ['votes', 'comments', 'questions', 'modules'];
  if (!VALID.includes(baseBinId)) {
    return new Response(JSON.stringify({ error: `Unknown binId: ${baseBinId}` }), { status: 400 });
  }

  try {
    const store = getStore({ name: 'cq-review', consistency: 'strong' });

    if (baseBinId === 'modules') {
      const value = await store.get('modules', { type: 'json' });
      const defaultModules = [
        {
          id: 'nutritional-intervention',
          title: 'Nutritional Intervention',
          description: 'Dietary habits, nutritional interventions, and physiological health outcomes.'
        }
      ];
      return new Response(JSON.stringify({ record: value ?? defaultModules }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let binKey;
    if (moduleId) {
      binKey = version === 1 ? `mod_${moduleId}_${baseBinId}` : `mod_${moduleId}_${baseBinId}-v${version}`;
    } else {
      binKey = version === 1 ? baseBinId : `${baseBinId}-v${version}`;
    }

    let value = await store.get(binKey, { type: 'json' });

    // Fallback for initial nutritional-intervention module to legacy keys if mod_nutritional-intervention_* is not found
    if (value === null && moduleId === 'nutritional-intervention') {
      const legacyKey = version === 1 ? baseBinId : `${baseBinId}-v${version}`;
      value = await store.get(legacyKey, { type: 'json' });
    }

    const record = value ?? (baseBinId === 'questions' ? [] : {});
    
    return new Response(JSON.stringify({ record }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Blob read failed', detail: err.message }), { status: 502 });
  }
};
