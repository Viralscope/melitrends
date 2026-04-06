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

  const site = req.query.site || 'MLA';
  const category = req.query.category || '';

  try {
    const token = await getToken();
    const url = category
      ? `https://api.mercadolibre.com/trends/${site}/${category}`
      : `https://api.mercadolibre.com/trends/${site}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!response.ok) return res.status(500).json({ error: 'Trends error', detail: data });

    const trends = Array.isArray(data)
      ? data.slice(0, 20).map((item, i) => ({
          keyword: item.keyword,
          url: item.url,
          rank: i + 1,
        }))
      : [];

    return res.status(200).json({ site, trends });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
