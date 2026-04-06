async function getToken() {
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
  return data.access_token;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { site = 'MLA' } = req.query;

  try {
    const token = await getToken();
    const response = await fetch(`https://api.mercadolibre.com/sites/${site}/categories`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();

    if (!response.ok) return res.status(500).json({ error: 'Categories error', detail: data });

    return res.status(200).json({ site, categories: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
