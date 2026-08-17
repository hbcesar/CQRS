/**
 * GET /api/bin-read?binId=<id>
 *
 * Proxies a read (GET /latest) to JSONBin.
 * The API key is read from the JSONBIN_API_KEY environment variable —
 * it never reaches the browser.
 */
export async function handler(event) {
  const binId = event.queryStringParameters?.binId;

  if (!binId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing binId parameter' }) };
  }

  const apiKey = process.env.JSONBIN_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfiguration: missing API key' }) };
  }

  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { 'X-Master-Key': apiKey }
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
