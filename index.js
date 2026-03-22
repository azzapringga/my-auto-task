const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// CONFIG
const USD_TO_IDR = 15000;  // tetap statis
const LOOP_COUNT = 6;      // jumlah scan per siklus
const LOOP_INTERVAL = 50000; // 50 detik per scan
const PER_PAGE = 50;       // koin per page
const TOTAL_PAGES = 2;     // scan 2 halaman → total 100 koin
const MAX_RETRIES = 2;     // retry saat 429

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
    console.error("❌ Telegram error:", err.message);
  }
}

// ================= FETCH =================
async function fetchData(page = 1, retries = MAX_RETRIES) {
  try {
    return await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: {
        vs_currency: "usd",
        order: "volume_desc",
        per_page: PER_PAGE,
        page
      },
      timeout: 10000
    });
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      console.log("⚠️ Kena limit, retry...");
      await delay(20000);
      return fetchData(page, retries - 1);
    }
    throw err;
  }
}

// ================= SCAN =================
async function scan() {
  try {
    let allCoins = [];

    for (let p = 1; p <= TOTAL_PAGES; p++) {
      const res = await fetchData(p);
      allCoins = allCoins.concat(res.data);
    }

    let oldData = {};
    if (fs.existsSync(FILE_JSON)) oldData = JSON.parse(fs.readFileSync(FILE_JSON));

    let newData = {};
    let signals = [];

    allCoins.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const price = c.current_price;
      const volume = c.total_volume;
      const priceIDR = price * USD_TO_IDR;

      const history = oldData[symbol] || [];

      if (history.length >= 2) {
        const prev = history[history.length - 1];
        const prev2 = history[history.length - 2];

        const change1 = ((price - prev.price) / prev.price) * 100;
        const change2 = ((prev.price - prev2.price) / prev2.price) * 100;
        const volumeSpike = volume / (prev.volume || 1);

        let label = "";
        let emoji = "";

        if (change1 > 5) {
          label = "SKIP (TERLAMBAT)";
          emoji = "❌";
        } else if (change1 > 0.3 && change2 > 0.15 && volumeSpike > 1.4) {
          label = "VALID ENTRY";
          emoji = "✅";
        } else if (change1 < -0.3 && volumeSpike < 0.8) {
          label = "EXIT POINT";
          emoji = "🛑";
        } else if (change1 > 0.2 && volumeSpike > 1.2) {
          label = "RISKY";
          emoji = "⚠️";
        }

        if (label) {
          signals.push({
            symbol,
            change: change1.toFixed(2),
            spike: volumeSpike.toFixed(2),
            price: priceIDR,
            label,
            emoji
          });
        }
      }

      newData[symbol] = [...history, { price, volume }].slice(-3);
    });

    // ================= TELEGRAM =================
    if (signals.length) {
      let msg = "🔥 PRO TRADER HYBRID SIGNAL (100 COINS)\n\n";
      signals.slice(0, 7).forEach(c => {
        msg += `${c.emoji} ${c.symbol} | +${c.change}% | 🔥x${c.spike}\n`;
        msg += `${c.label}\n💰 Rp${c.price.toLocaleString("id-ID")}\n\n`;
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

// ================= LOOP =================
async function runBot() {
  console.log("🚀 Bot dimulai (PRO TRADER HYBRID OPTIMAL 100 COINS)");

  for (let i = 1; i <= LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i}`);
    await scan();
    await delay(LOOP_INTERVAL);
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
