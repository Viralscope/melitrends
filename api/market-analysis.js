// api/market-analysis.js
// MeliTrends - Endpoint de Análisis de Mercado
// Llama a la API de MercadoLibre y devuelve:
//   - Top vendedores con % de dominio de mercado
//   - Productos más vendidos
//   - Análisis de precios (min, max, promedio, distribución)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q, site = 'MLA' } = req.query;

  if (!q || q.trim() === '') {
    return res.status(400).json({ error: 'El parámetro "q" es requerido' });
  }

  try {
    // Traemos hasta 50 resultados de MercadoLibre
    const searchUrl = `https://api.mercadolibre.com/sites/${site}/search?q=${encodeURIComponent(q)}&limit=50`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MeliTrends/1.0)',
        'Accept': 'application/json',
      }
    });

    if (!searchRes.ok) {
      throw new Error(`MercadoLibre API error: ${searchRes.status}`);
    }

    const searchData = await searchRes.json();
    const items = searchData.results || [];

    if (items.length === 0) {
      return res.status(200).json({
        query: q,
        site,
        total_results: 0,
        sellers: [],
        top_products: [],
        price_analysis: null,
      });
    }

    // ─── 1. ANÁLISIS DE VENDEDORES ───────────────────────────────────────────
    const sellerMap = {};

    for (const item of items) {
      const sellerId = item.seller?.id;
      const sellerNickname = item.seller?.nickname || `Vendedor ${sellerId}`;
      const sold = item.sold_quantity || 0;

      if (!sellerId) continue;

      if (!sellerMap[sellerId]) {
        sellerMap[sellerId] = {
          id: sellerId,
          nickname: sellerNickname,
          total_sold: 0,
          listings: 0,
          avg_price: 0,
          prices: [],
        };
      }

      sellerMap[sellerId].total_sold += sold;
      sellerMap[sellerId].listings += 1;
      sellerMap[sellerId].prices.push(item.price || 0);
    }

    // Calcular precio promedio por vendedor y total de ventas del mercado
    let totalMarketSold = 0;
    for (const seller of Object.values(sellerMap)) {
      seller.avg_price =
        seller.prices.reduce((a, b) => a + b, 0) / seller.prices.length;
      delete seller.prices; // no necesitamos enviar esto al frontend
      totalMarketSold += seller.total_sold;
    }

    // Ordenar por total_sold desc, tomar top 10
    const topSellers = Object.values(sellerMap)
      .sort((a, b) => b.total_sold - a.total_sold)
      .slice(0, 10)
      .map((s) => ({
        ...s,
        market_share: totalMarketSold > 0
          ? parseFloat(((s.total_sold / totalMarketSold) * 100).toFixed(1))
          : 0,
        avg_price: parseFloat(s.avg_price.toFixed(2)),
      }));

    // ─── 2. PRODUCTOS MÁS VENDIDOS ───────────────────────────────────────────
    const topProducts = [...items]
      .sort((a, b) => (b.sold_quantity || 0) - (a.sold_quantity || 0))
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        currency_id: item.currency_id,
        sold_quantity: item.sold_quantity || 0,
        thumbnail: item.thumbnail,
        permalink: item.permalink,
        condition: item.condition,
        seller_nickname: item.seller?.nickname || 'Desconocido',
      }));

    // ─── 3. ANÁLISIS DE PRECIOS ──────────────────────────────────────────────
    const prices = items
      .map((i) => i.price)
      .filter((p) => p && p > 0)
      .sort((a, b) => a - b);

    const priceMin = prices[0];
    const priceMax = prices[prices.length - 1];
    const priceAvg = parseFloat(
      (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)
    );
    const priceMedian = parseFloat(
      prices.length % 2 === 0
        ? ((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2).toFixed(2)
        : prices[Math.floor(prices.length / 2)].toFixed(2)
    );

    // Distribución en 5 rangos iguales
    const rangeSize = (priceMax - priceMin) / 5 || 1;
    const distribution = Array.from({ length: 5 }, (_, i) => {
      const from = parseFloat((priceMin + i * rangeSize).toFixed(2));
      const to = parseFloat((priceMin + (i + 1) * rangeSize).toFixed(2));
      const count = prices.filter((p) => p >= from && p < to).length;
      return { from, to, count };
    });
    // Asegurar que el último rango incluye el máximo
    if (distribution[4]) distribution[4].to = priceMax;

    // Outliers: precios fuera de 1.5x IQR
    const q1 = prices[Math.floor(prices.length * 0.25)];
    const q3 = prices[Math.floor(prices.length * 0.75)];
    const iqr = q3 - q1;
    const outliers = prices.filter(
      (p) => p < q1 - 1.5 * iqr || p > q3 + 1.5 * iqr
    );

    const priceAnalysis = {
      min: priceMin,
      max: priceMax,
      avg: priceAvg,
      median: priceMedian,
      currency_id: items[0]?.currency_id || 'ARS',
      distribution,
      outliers_count: outliers.length,
      sample_size: prices.length,
    };

    // ─── RESPUESTA FINAL ─────────────────────────────────────────────────────
    return res.status(200).json({
      query: q,
      site,
      total_results: searchData.paging?.total || items.length,
      sample_size: items.length,
      sellers: topSellers,
      top_products: topProducts,
      price_analysis: priceAnalysis,
    });
  } catch (error) {
    console.error('market-analysis error:', error);
    return res.status(500).json({
      error: 'Error al obtener datos de MercadoLibre',
      detail: error.message,
    });
  }
}
