const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram config
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Kurs Rupiah (tetap)
const USD_TO_IDR = 15000;

// Konfigurasi bot
const PER_PAGE = 50; // fokus 50 koin top market cap
const BIG_PUMP_THRESHOLD = 1.05; // 5% kenaikan
const LOOP_COUNT = 6;
const LOOP_INTERVAL = 60000; // 60 detik (bisa disesuaikan)

// Delay helper
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
    console.error("❌ Telegram error:", err.response?.data || err.message);
  }
}

// ================= FETCH DATA =================
async function fetchData(retries = 3) {
  try {
    return await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: {
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: PER_PAGE,
        page: 1
      },
      timeout: 10000
    });
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      const wait = 15000 + Math.random() * 5000;
      console.log(`⚠️ Kena limit, retry setelah ${Math.round(wait/1000)} detik...`);
      await delay(wait);
      return fetchData(retries - 1);
    }
    throw err;
  }
}

// ================= ANALISA PUMP =================
async function analyze() {
  try {
    const res = await fetchData();

    let oldData = {};
    if (fs.existsSync(FILE_JSON)) {
      oldData = JSON.parse(fs.readFileSync(FILE_JSON));
    }

    let newData = {};
    let signals = [];

    res.data.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const priceUSD = c.current_price;
      const priceIDR = priceUSD * USD_TO_IDR;
      const volume = c.total_volume;

      const history = oldData[symbol] || [];

      if (history.length >= 2) {
        const prev = history[history.length - 1];
        const prev2 = history[history.length - 2];

        const change1 = ((priceUSD - prev) / prev) * 100;
        const change2 = ((prev - prev2) / prev2) * 100;

        const volumeSpike = volume / (prev2 || 1);

        let label = "";
        let emoji = "";

        // SKIP koin top volume lambat
        if (volume > 5000000000 && change1 < 0.2) {
          label = "TOP VOLUME LAMBAT";
          emoji = "⏳";
        }
        // BIG PUMP / peluang top gainer
        else if (change1 > 5) {
          label = "BIG PUMP";
          emoji = "🔥";
        }
        // VALID ENTRY
        else if (change1 > 1.5 && volumeSpike > 1.2) {
          label = "VALID ENTRY";
          emoji = "✅";
        }

        if (label && label !== "TOP VOLUME LAMBAT") {
          signals.push({ symbol, price: priceIDR, change: change1.toFixed(2), spike: volumeSpike.toFixed(2), label, emoji });
        }
      }

      newData[symbol] = [...history, priceUSD].slice(-3);
    });

    // ================= KIRIM TELEGRAM =================
    if (signals.length) {
      let msg = "🚀 *Hybrid Sniper Aggressive Mode*\n\n";
      signals.forEach(c => {
        msg += `${c.emoji} ${c.symbol} | +${c.change}% | 🔥x${c.spike}\n${c.label}\n💰 Rp${c.price.toLocaleString("id-ID")}\n\n`;
      });
      await sendTelegram(msg);
    } else {
      console.log("⚠️ Tidak ada signal kuat, skip Telegram");
    }

    // Simpan JSON
    fs.writeFileSync(FILE_JSON, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("❌ Fetch/Analisa error:", err.message);
  }
}

// ================= LOOP =================
async function runBot() {
  console.log("🚀 Bot dimulai (Hybrid Sniper Aggressive Mode)");

  for (let i = 1; i <= LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan mini ke-${i}`);
    await analyze();
    await delay(LOOP_INTERVAL);
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
