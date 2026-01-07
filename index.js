const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const app = express();
const PORT = process.env.PORT || 3000;

// 1. Inicialización de la Base de Datos
const db = new sqlite3.Database('/app/data/historial_precios.db');

db.run(`CREATE TABLE IF NOT EXISTS precios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bcv_usd REAL,
    bcv_eur REAL,
    binance_ves REAL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

// 2. Funciones de obtención de datos (tus funciones originales)
async function getBCV() {
    try {
        const { data } = await axios.get('https://www.bcv.org.ve/', {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
            timeout: 15000
        });
        const $ = cheerio.load(data);
        const usd = $('#dolar strong').text().trim().replace(',', '.');
        const eur = $('#euro strong').text().trim().replace(',', '.');
        return { usd: parseFloat(usd) || 0, eur: parseFloat(eur) || 0 };
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

// 3. Tarea Programada: Guardar en Historial CADA HORA
cron.schedule('0 * * * *', async () => {
    console.log("Ejecutando guardado de historial por hora...");
    const bcv = await getBCV();
    const binance = await getBinance();
    
    if(bcv.usd > 0 && binance > 0) {
        db.run(`INSERT INTO precios (bcv_usd, bcv_eur, binance_ves) VALUES (?, ?, ?)`, 
        [bcv.usd, bcv.eur, binance]);
        console.log("Historial actualizado correctamente.");
    }
});

// --- ENDPOINTS ---

// Tasas actuales (Tiempo real)
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

// Historial para las gráficas (Últimos 7 días / 168 horas)
app.get('/historial', (req, res) => {
    db.all(`SELECT * FROM precios ORDER BY fecha DESC LIMIT 168`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.reverse()); // Reverse para que el gráfico fluya de izquierda a derecha
    });
});

app.listen(PORT, () => console.log(`Servidor con historial corriendo en puerto ${PORT}`));