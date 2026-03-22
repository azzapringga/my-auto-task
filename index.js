const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram config dari GitHub Secrets
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Kurs Rupiah (tetap statis agar hemat limit GitHub)
const USD_TO_IDR = 15000;

// Konfigurasi Bot
const LOOP_MINI = 2;           // Mini scan per siklus
const PER_PAGE = 70;           // Ambil top 70 koin (filter awal)
const BIG_PUMP_THRESHOLD = 1.05; // +5% untuk big pump
const VOLUME_MAX = 5000000000;  // Skip koin super top volume

const delay = ms => new Promise(res => setTimeout(res, ms));

// ================= TELEGRAM =================
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
    console.error("❌ Error Telegram:", err.response?.data || err.message);
  }
}

// ================= FETCH =================
async function fetchData(retries = 2) {
  try {
    return await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: { vs_currency: "usd", order: "market_cap_desc", per_page: PER_PAGE, page: 1 },
      timeout: 10000
    });
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      console.log("⚠️ Kena limit, retry...");
      await delay(15000);
      return fetchData(retries - 1);
    }
    throw err;
  }
}

// ================= MAIN SCAN =================
async function analyze() {
  try {
    const res = await fetchData();
    let oldData = fs.existsSync(FILE_JSON) ? JSON.parse(fs.readFileSync(FILE_JSON)) : {};
    let newData = {};
    let signals = [];

    res.data.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const priceUSD = c.current_price;
      const priceIDR = priceUSD * USD_TO_IDR;

      // Skip koin top volume lambat
      if (c.total_volume > VOLUME_MAX) return;

      const history = oldData[symbol] || [];
      let label = "";
      let emoji = "";

      // Minimal 1 history → early pump
      if (history.length >= 1) {
        const prev = history[history.length - 1];
        const change = ((priceUSD - prev.price)/prev.price)*100;

        if (change >= 0.3 && change < 1) { label = "EARLY PUMP"; emoji = "🟢"; }
        else if (change >= 1 && change < 3) { label = "BREAKOUT"; emoji = "🚀"; }
        else if (change >= 3) { label = "BIG PUMP"; emoji = "🔥"; }

        if (label) {
          signals.push({ symbol, price: priceIDR, change: change.toFixed(2), emoji });
        }
      }

      // Update history terakhir 2 data
      newData[symbol] = [...history, { price: priceUSD, volume: c.total_volume }].slice(-2);
    });

    // ================= TELEGRAM =================
    if (signals.length > 0) {
      let msg = "*🚀 HYBRID SNIPER SIGNAL*\n\n";
      signals.slice(0, 10).forEach(s => {
        msg += `${s.emoji} ${s.symbol} | +${s.change}% | Rp${s.price.toLocaleString("id-ID")}\n`;
      });
      await sendTelegram(msg);
    } else {
      console.log("⚠️ Tidak ada signal kuat, skip Telegram");
    }

    fs.writeFileSync(FILE_JSON, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("❌ Fetch error:", err.message);
  }
}

// ================= LOOP MINI =================
async function runBot() {
  console.log("🚀 Bot dimulai (Hybrid Sniper Optimized)");

  for (let i = 1; i <= LOOP_MINI; i++) {
    console.log(`\n⏱️ Scan mini ke-${i}`);
    await analyze();
    if (i < LOOP_MINI) await delay(20000); // delay mini scan 20 detik
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
