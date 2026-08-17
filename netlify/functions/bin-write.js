/**
 * POST /api/bin-write
 *
 * Body (JSON): { binId: string, data: any }
 *
 * Proxies a write (PUT) to JSONBin.
 * The API key is read from the JSONBIN_API_KEY environment variable —
 * it never reaches the browser.
 */
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.JSONBIN_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfiguration: missing API key' }) };
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

  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': apiKey
      },
      body: JSON.stringify(data)
    });

    const body = await res.text();

    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json' },
      body
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Upstream request failed', detail: err.message })
    };
  }
}
