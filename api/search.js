module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { q, site = 'MLA', limit = 20 } = req.query;
  if (!q) return res.status(400).json({ error: 'Falta el parametro q' });

  try {
    const url = `https://api.mercadolibre.com/sites/${site}/search?q=${encodeURIComponent(q)}&limit=${limit}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'es-AR,es;q=0.9',
        'Referer': 'https://www.mercadolibre.com.ar/',
        'Origin': 'https://www.mercadolibre.com.ar',
      }
    });
    const data = await response.json();

    if (!response.ok) return res.status(500).json({ error: 'Search error', detail: data });

    const results = (data.results || []).map(item => ({
      id: item.id,
      title: item.title,
      price: item.price,
      currency: item.currency_id,
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
      (results.length > 0 ? results.filter(r => r.free_shipping).length / results.length * 30 : 0)
    ));

    return res.status(200).json({
      keyword: q, site,
      total_results: paging.total || 0,
      sellers_count: sellers,
      avg_price: avgPrice, min_price: minPrice, max_price: maxPrice,
      opportunity_score: opportunityScore,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
