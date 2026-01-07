const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Binance P2P
const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

async function getBCV() {
    try {
        const { data } = await axios.get('https://www.bcv.org.ve/', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
        });
        const $ = cheerio.load(data);
        return {
            usd: parseFloat($('#dolar strong').text().replace(',', '.')),
            eur: parseFloat($('#euro strong').text().replace(',', '.'))
        };
    } catch (e) { return { usd: 0, eur: 0 }; }
}

async function getBinance() {
    try {
        const payload = {
            asset: 'USDT', fiat: 'VES', merchantCheck: false,
            page: 1, publisherType: null, rows: 20, tradeType: 'BUY'
        };
        const { data } = await axios.post(BINANCE_P2P_URL, payload);
        const prices = data.data.map(d => parseFloat(d.adv.price));
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        return parseFloat(avg.toFixed(2));
    } catch (e) { return 0; }
}

app.get('/tasas', async (req, res) => {
    const bcv = await getBCV();
    const binance = await getBinance();
    res.json({
        bcv_usd: bcv.usd,
        bcv_eur: bcv.eur,
        binance_ves: binance,
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));