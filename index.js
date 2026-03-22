const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram config
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Konstanta
const USD_TO_IDR = 15000;       // tetap statis, hemat limit
const PER_PAGE = 70;            // scan 70 koin potensial
const LOOP_COUNT = 5;           // loop mini lebih agresif
const LOOP_INTERVAL = 8000;     // 8 detik antar scan mini
const EARLY_PUMP_THRESHOLD = 0.3;  // lebih sensitif

// Telegram function
async function sendTelegram(message) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown"
    });
    console.log("✅ Telegram terkirim");
  } catch (err) {
    console.error("❌ Telegram error:", err.message);
  }
}

// Fetch market data
async function fetchData(retries = 2) {
  try {
    return await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: { vs_currency: "usd", order: "market_cap_desc", per_page: PER_PAGE, page: 1 },
      timeout: 10000
    });
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      console.log("⚠️ Kena limit, retry...");
      await new Promise(r=>setTimeout(r,15000));
      return fetchData(retries-1);
    }
    throw err;
  }
}

// Analisa koin
async function analyze() {
  const res = await fetchData();
  let oldData = fs.existsSync(FILE_JSON) ? JSON.parse(fs.readFileSync(FILE_JSON)) : {};
  let newData = {};
  let signals = [];

  res.data.forEach(c => {
    const symbol = c.symbol.toUpperCase();
    const priceUSD = c.current_price;
    const priceIDR = priceUSD * USD_TO_IDR;
    const volume = c.total_volume;

    const history = oldData[symbol] || [];
    let change = 0;
    if (history.length) {
      const prev = history[history.length-1];
      change = prev>0 ? (priceUSD - prev)/prev*100 : 0;
    }

    // Kriteria top gainer / early pump
    if (change >= EARLY_PUMP_THRESHOLD && volume > 1000) {
      signals.push({ symbol, change: change.toFixed(2), price: priceIDR, volume });
    }

    newData[symbol] = [...history, priceUSD].slice(-2);
  });

  fs.writeFileSync(FILE_JSON, JSON.stringify(newData,null,2));
  return signals;
}

// Main loop mini scan
async function runBot() {
  console.log("🚀 Bot dimulai (Hybrid Sniper Aggressive Mode)");

  for (let i=1;i<=LOOP_COUNT;i++) {
    console.log(`⏱️ Scan mini ke-${i}`);
    const signals = await analyze();
    if (signals.length) {
      let msg = "*🚀 CRYPTO TOP GAINER ALERT*\n\n";
      signals.forEach(c=>{
        msg += `🔥 ${c.symbol} | +${c.change}% | 💰 Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      await sendTelegram(msg);
    } else {
      console.log("⚠️ Tidak ada signal kuat, skip Telegram");
    }
    await new Promise(r=>setTimeout(r, LOOP_INTERVAL));
  }

  console.log("✅ Selesai 1 run");
}

runBot();
