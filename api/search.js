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

  const { q, site = 'MLA', limit = 20, sort = 'relevance' } = req.query;

  if (!q) return res.status(400).json({ error: 'Falta el parámetro q (keyword)' });

  try {
    const token = await getToken();
    const url = `https://api.mercadolibre.com/sites/${site}/search?q=${encodeURIComponent(q)}&limit=${limit}&sort=${sort}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!response.ok) return res.status(500).json({ error: 'Search error', detail: data });

    const results = (data.results || []).map(item => ({
      id: item.id,
      title: item.title,
      price: item.price,
      currency: item.currency_id,
      sold_quantity: item.sold_quantity || 0,
      available_quantity: item.available_quantity || 0,
      condition: item.condition,
      thumbnail: item.thumbnail,
      permalink: item.permalink,
      seller_id: item.seller?.id,
      free_shipping: item.shipping?.free_shipping || false,
    }));

    const paging = data.paging || {};
    const prices = results.map(r => r.price).filter(Boolean);
    const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;
    const sellers = new Set(results.map(r => r.seller_id)).size;

    const opportunityScore = Math.min(100, Math.round(
      (paging.total > 1000 ? 40 : paging.total / 25) +
      (sellers < 50 ? 30 : sellers < 200 ? 20 : 10) +
      (results.filter(r => r.free_shipping).length / results.length * 30)
    ));

    return res.status(200).json({
      keyword: q,
      site,
      total_results: paging.total || 0,
      sellers_count: sellers,
      avg_price: avgPrice,
      min_price: minPrice,
      max_price: maxPrice,
      opportunity_score: opportunityScore,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
