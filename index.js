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
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }), // Ignora errores de certificado si los hay
            timeout: 15000
        });
        const $ = cheerio.load(data);
        
        // Selectores específicos por ID
        const usd = $('#dolar strong').text().trim().replace(',', '.');
        const eur = $('#euro strong').text().trim().replace(',', '.');

        return {
            usd: parseFloat(usd) || 0,
            eur: parseFloat(eur) || 0
        };
    } catch (e) { 
        console.error("Error en BCV:", e.message);
        return { usd: 0, eur: 0 }; 
    }
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

app.listen(PORT, () => console.log(`Servidor esta corriendo en el puerto ${PORT}`));
//Cambio 2121 asas


