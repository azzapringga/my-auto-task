const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram config
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Config
const USD_TO_IDR = 15000;
const LOOP_INTERVAL = 60000; // 1 menit
const LOOP_COUNT = 10; // 10x loop (total ±10 menit)

// FUNCTION TELEGRAM
async function sendTelegram(message) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown"
    });
    console.log("✅ Telegram terkirim");
  } catch (err) {
    console.error("❌ Telegram error:", err.response?.data || err.message);
  }
}

// SCAN FUNCTION
async function scanMarket() {
  try {
    const res = await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: { vs_currency: "usd", order: "market_cap_desc", per_page: 100, page: 2 },
      timeout: 10000
    });

    let oldData = {};
    if (fs.existsSync(FILE_JSON)) {
      oldData = JSON.parse(fs.readFileSync(FILE_JSON));
    }

    let newData = {};
    let early = [], fast = [], beruntun = [];

    res.data.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const priceUSD = c.current_price;
      const priceIDR = priceUSD * USD_TO_IDR;
      const volume = c.total_volume * USD_TO_IDR;

      // SIMPAN HISTORY (max 5 data = ~5 menit)
      let history = oldData[symbol] || [];
      if (!Array.isArray(history)) history = [history];
      history.push(priceUSD);
      history = history.slice(-5);
      newData[symbol] = history;

      const isCheap = priceIDR < 15000 && priceIDR > 50;

      // =========================
      // 🔥 FAST PUMP (BARU)
      // =========================
      if (history.length >= 2) {
        const prev = history[history.length - 2];
        const change1m = ((priceUSD - prev) / prev) * 100;

        if (change1m >= 2) {
          fast.push({
            symbol,
            change: change1m.toFixed(2),
            price: priceIDR,
            volume
          });
        }
      }

      // =========================
      // 🟢 EARLY PUMP (REVISI)
      // =========================
      if (history.length >= 2) {
        const prev = history[history.length - 2];
        const change = ((priceUSD - prev) / prev) * 100;

        if (isCheap && change >= 0.5 && change < 2) {
          early.push({ symbol, change: change.toFixed(3), price: priceIDR });
        }
      }

      // =========================
      // 🔼 PUMP BERUNTUN
      // =========================
      if (history.length >= 3) {
        const p1 = history[history.length - 3];
        const p2 = history[history.length - 2];
        const p3 = history[history.length - 1];

        const ch1 = ((p2 - p1) / p1) * 100;
        const ch2 = ((p3 - p2) / p2) * 100;

        if (isCheap && ch1 > 0.5 && ch2 > 0.5 && volume > 500000000) {
          beruntun.push({
            symbol,
            totalChange: (ch1 + ch2).toFixed(2),
            price: priceIDR,
            volume
          });
        }
      }
    });

    // =========================
    // FORMAT TELEGRAM
    // =========================
    let msg = "*🚀 CRYPTO PUMP ALERT (REALTIME MODE)*\n\n";

    if (fast.length) {
      msg += "🔥 *FAST PUMP (1m)*\n";
      fast.forEach(c => {
        msg += `*${c.symbol}* | +${c.change}% | Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      msg += "\n";
    }

    if (early.length) {
      msg += "🟢 *EARLY TREND*\n";
      early.forEach(c => {
        msg += `*${c.symbol}* | +${c.change}% | Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      msg += "\n";
    }

    if (beruntun.length) {
      msg += "🔼 *PUMP BERUNTUN*\n";
      beruntun.forEach(c => {
        msg += `*${c.symbol}* | +${c.totalChange}% | Vol: Rp${c.volume.toLocaleString("id-ID")} | Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      msg += "\n";
    }

    if (fast.length + early.length + beruntun.length > 0) {
      await sendTelegram(msg);
    } else {
      console.log("⏳ Tidak ada sinyal...");
    }

    fs.writeFileSync(FILE_JSON, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  }
}

// =========================
// 🔁 LOOP INTERNAL (KUNCI UTAMA)
// =========================
async function runBot() {
  console.log("🚀 Bot dimulai (Realtime Simulation Mode)");

  for (let i = 0; i < LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i + 1}`);
    await scanMarket();

    if (i < LOOP_COUNT - 1) {
      await new Promise(r => setTimeout(r, LOOP_INTERVAL));
    }
  }

  console.log("✅ Selesai 1 siklus GitHub Action");
}

runBot();
