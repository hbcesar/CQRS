export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const expectedPassword = process.env.AdminPassword;
    
    // If no password is set in the environment, we can either allow it or block it. 
    // It's safer to block it to prevent unauthorized access if the variable is missing.
    if (!expectedPassword) {
      return new Response(JSON.stringify({ success: false, error: 'Admin password not configured on server' }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (body.password === expectedPassword) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: 'Invalid password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Verification failed' }), { status: 400 });
  }
};
