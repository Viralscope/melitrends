module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const response = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.MELI_CLIENT_ID,
        client_secret: process.env.MELI_CLIENT_SECRET,
      }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: 'Token error', detail: data });
    return res.status(200).json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
