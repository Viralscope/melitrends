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

  const { category = 'MLA1430', site = 'MLA', limit = 20 } = req.query;

  try {
    const token = await getToken();

    // Hot items por categoría
    const url = `https://api.mercadolibre.com/sites/${site}/search?category=${category}&sort=sold_quantity_desc&limit=${limit}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();

    if (!response.ok) return res.status(500).json({ error: 'Hot items error', detail: data });

    const results = (data.results || []).map((item, i) => ({
      rank: i + 1,
      id: item.id,
      title: item.title,
      price: item.price,
      currency: item.currency_id,
      sold_quantity: item.sold_quantity || 0,
      available_quantity: item.available_quantity || 0,
      condition: item.condition,
      thumbnail: item.thumbnail,
      permalink: item.permalink,
      free_shipping: item.shipping?.free_shipping || false,
      seller_id: item.seller?.id,
    }));

    // Calcular métricas de la categoría
    const prices = results.map(r => r.price).filter(Boolean);
    const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;
    const totalSold = results.reduce((a, r) => a + (r.sold_quantity || 0), 0);
    const sellers = new Set(results.map(r => r.seller_id)).size;

    return res.status(200).json({
      category,
      site,
      total_results: data.paging?.total || 0,
      avg_price: avgPrice,
      total_sold: totalSold,
      sellers_count: sellers,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
