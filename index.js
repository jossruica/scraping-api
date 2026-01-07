const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE PERSISTENCIA ---
// Aseguramos que el directorio /app/data exista para evitar SQLITE_CANTOPEN
const dbDir = '/app/data';
if (!fs.existsSync(dbDir)) {
    console.log("📁 Creando directorio para base de datos...");
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'historial_precios.db');

// Inicializamos la DB con manejo de errores
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ Error fatal al abrir la base de datos:", err.message);
    } else {
        console.log("✅ Conectado a SQLite en:", dbPath);
    }
});

// Crear tabla historial si no existe
db.run(`CREATE TABLE IF NOT EXISTS precios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bcv_usd REAL,
    bcv_eur REAL,
    binance_ves REAL,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// --- LÓGICA DE SCRAPING ---
const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const agent = new https.Agent({ rejectUnauthorized: false });

async function getBCV() {
    try {
        const { data } = await axios.get('https://www.bcv.org.ve/', {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html'
            },
            httpsAgent: agent,
            timeout: 15000
        });
        const $ = cheerio.load(data);
        const usd = $('#dolar strong').text().trim().replace(',', '.');
        const eur = $('#euro strong').text().trim().replace(',', '.');
        return { 
            usd: parseFloat(usd) || 0, 
            eur: parseFloat(eur) || 0 
        };
    } catch (e) {
        console.error("⚠️ Error BCV:", e.message);
        return { usd: 0, eur: 0 };
    }
}

async function getBinance() {
    try {
        const payload = {
            asset: 'USDT', fiat: 'VES', merchantCheck: false,
            page: 1, publisherType: null, rows: 20, tradeType: 'BUY'
        };
        const { data } = await axios.post(BINANCE_P2P_URL, payload, { timeout: 10000 });
        if (!data.data) return 0;
        const prices = data.data.map(d => parseFloat(d.adv.price));
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        return parseFloat(avg.toFixed(2));
    } catch (e) { 
        console.error("⚠️ Error Binance:", e.message);
        return 0; 
    }
}

// --- TAREAS PROGRAMADAS ---
// Guardar historial cada hora (minuto 0 de cada hora)
cron.schedule('0 * * * *', async () => {
    console.log("🕒 Iniciando guardado de historial horario...");
    const bcv = await getBCV();
    const binance = await getBinance();
    
    // Solo guardamos si tenemos datos válidos
    if (bcv.usd > 0 && binance > 0) {
        db.run(
            `INSERT INTO precios (bcv_usd, bcv_eur, binance_ves) VALUES (?, ?, ?)`, 
            [bcv.usd, bcv.eur, binance],
            (err) => {
                if (err) console.error("❌ Error al insertar en DB:", err.message);
                else console.log("💾 Historial guardado con éxito.");
            }
        );
    } else {
        console.log("🚫 Datos incompletos, se saltó el guardado.");
    }
});

// --- ENDPOINTS ---

// 1. Root - Estado del servidor
app.get('/', (req, res) => {
    res.send('✅ Venecambios API Online. Endpoints: /tasas, /historial');
});

// 2. Tasas actuales (Tiempo Real)
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

// 3. Historial (Últimas 168 horas / 7 días)
app.get('/historial', (req, res) => {
    db.all(`SELECT * FROM precios ORDER BY fecha DESC LIMIT 168`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.reverse()); // Orden cronológico para gráficas
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📂 Base de datos en: ${dbPath}`);
});