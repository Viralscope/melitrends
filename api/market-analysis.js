// api/market-analysis.js — MeliTrends
// Usa autenticación OAuth igual que trends.js

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q, site = 'MLA' } = req.query;
  if (!q || q.trim() === '') return res.status(400).json({ error: 'El parámetro "q" es requerido' });

  try {
    const token = await getToken();
    const searchUrl = `https://api.mercadolibre.com/sites/${site}/search?q=${encodeURIComponent(q)}&limit=50`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!searchRes.ok) throw new Error(`MercadoLibre API error: ${searchRes.status}`);

    const searchData = await searchRes.json();
    const items = searchData.results || [];

    if (items.length === 0) {
      return res.status(200).json({ query: q, site, total_results: 0, sellers: [], top_products: [], price_analysis: null });
    }

    // ── VENDEDORES ──────────────────────────────────────────────────────────
    const sellerMap = {};
    for (const item of items) {
      const sellerId = item.seller?.id;
      if (!sellerId) continue;
      if (!sellerMap[sellerId]) {
        sellerMap[sellerId] = {
          id: sellerId,
          nickname: item.seller?.nickname || `Vendedor ${sellerId}`,
          total_sold: 0, listings: 0, prices: [],
        };
      }
      sellerMap[sellerId].total_sold += item.sold_quantity || 0;
      sellerMap[sellerId].listings += 1;
      sellerMap[sellerId].prices.push(item.price || 0);
    }

    let totalMarketSold = 0;
    for (const s of Object.values(sellerMap)) {
      s.avg_price = s.prices.reduce((a, b) => a + b, 0) / s.prices.length;
      delete s.prices;
      totalMarketSold += s.total_sold;
    }

    const topSellers = Object.values(sellerMap)
      .sort((a, b) => b.total_sold - a.total_sold)
      .slice(0, 10)
      .map((s) => ({
        ...s,
        market_share: totalMarketSold > 0 ? parseFloat(((s.total_sold / totalMarketSold) * 100).toFixed(1)) : 0,
        avg_price: parseFloat(s.avg_price.toFixed(2)),
      }));

    // ── PRODUCTOS MÁS VENDIDOS ──────────────────────────────────────────────
    const topProducts = [...items]
      .sort((a, b) => (b.sold_quantity || 0) - (a.sold_quantity || 0))
      .slice(0, 10)
      .map((item) => ({
        id: item.id, title: item.title, price: item.price,
        currency_id: item.currency_id, sold_quantity: item.sold_quantity || 0,
        thumbnail: item.thumbnail, permalink: item.permalink,
        condition: item.condition, seller_nickname: item.seller?.nickname || 'Desconocido',
      }));

    // ── ANÁLISIS DE PRECIOS ─────────────────────────────────────────────────
    const prices = items.map((i) => i.price).filter((p) => p && p > 0).sort((a, b) => a - b);
    const priceMin = prices[0];
    const priceMax = prices[prices.length - 1];
    const priceAvg = parseFloat((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2));
    const priceMedian = parseFloat(
      prices.length % 2 === 0
        ? ((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2).toFixed(2)
        : prices[Math.floor(prices.length / 2)].toFixed(2)
    );
    const rangeSize = (priceMax - priceMin) / 5 || 1;
    const distribution = Array.from({ length: 5 }, (_, i) => {
      const from = parseFloat((priceMin + i * rangeSize).toFixed(2));
      const to = parseFloat((priceMin + (i + 1) * rangeSize).toFixed(2));
      return { from, to, count: prices.filter((p) => p >= from && p < to).length };
    });
    if (distribution[4]) distribution[4].to = priceMax;
    const q1 = prices[Math.floor(prices.length * 0.25)];
    const q3 = prices[Math.floor(prices.length * 0.75)];
    const iqr = q3 - q1;
    const outliers = prices.filter((p) => p < q1 - 1.5 * iqr || p > q3 + 1.5 * iqr);

    return res.status(200).json({
      query: q, site,
      total_results: searchData.paging?.total || items.length,
      sample_size: items.length,
      sellers: topSellers,
      top_products: topProducts,
      price_analysis: {
        min: priceMin, max: priceMax, avg: priceAvg, median: priceMedian,
        currency_id: items[0]?.currency_id || 'ARS',
        distribution, outliers_count: outliers.length, sample_size: prices.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener datos de MercadoLibre', detail: error.message });
  }
};
