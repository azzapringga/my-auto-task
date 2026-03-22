const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// CONFIG
const USD_TO_IDR = 15000;
const LOOP_COUNT = 6;        // jumlah scan per workflow
const LOOP_INTERVAL = 30000; // 30 detik antar scan
const PER_PAGE = 50;          // scan 50 koin per page
const PAGES = 2;              // total 100 koin

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
async function fetchData(page = 1, retries = 2) {
  try {
    return await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: {
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: PER_PAGE,
        page: page
      },
      timeout: 10000
    });
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      console.log("⚠️ Kena limit, retry...");
      await delay(15000);
      return fetchData(page, retries - 1);
    }
    throw err;
  }
}

// ================= PRO TRADER SCAN =================
async function scan() {
  try {
    let oldData = {};
    if (fs.existsSync(FILE_JSON)) oldData = JSON.parse(fs.readFileSync(FILE_JSON));

    let newData = {};
    let signals = [];

    for (let page = 1; page <= PAGES; page++) {
      const res = await fetchData(page);

      res.data.forEach(c => {
        const symbol = c.symbol.toUpperCase();
        const price = c.current_price;
        const volume = c.total_volume;
        const priceIDR = price * USD_TO_IDR;

        // Hanya koin cheap untuk cepat naik
        if (priceIDR > 20000) return;

        const history = oldData[symbol] || [];

        // ================== ENTRY/EXIT LOGIC ==================
        let label = "";
        let emoji = "";

        if (history.length >= 2) {
          const prev = history[history.length - 1];
          const prev2 = history[history.length - 2];

          const change1 = ((price - prev.price) / prev.price) * 100;
          const change2 = ((prev.price - prev2.price) / prev2.price) * 100;
          const volumeSpike = volume / (prev.volume || 1);

          // ENTRY POINT → awal ledakan harga cheap
          if (change1 > 0.35 && change2 > 0.2 && volumeSpike > 1.5) {
            label = "ENTRY POINT";
            emoji = "🚀";
          }
          // EXIT POINT → momentum mulai turun
          else if (change1 < -0.25 && change2 < 0 && volumeSpike < 0.8) {
            label = "EXIT POINT";
            emoji = "⚠️";
          }
          // RISKY → ada kenaikan tapi belum cukup valid
          else if (change1 > 0.2 && volumeSpike > 1.3) {
            label = "RISKY";
            emoji = "⚠️";
          }
        }

        if (label) {
          signals.push({
            symbol,
            change: ((price - (history[history.length - 1]?.price || price)) / (history[history.length - 1]?.price || price) * 100).toFixed(2),
            spike: (volume / (history[history.length - 1]?.volume || 1)).toFixed(2),
            price: priceIDR,
            label,
            emoji
          });
        }

        newData[symbol] = [...history, { price, volume }].slice(-3);
      });
    }

    // ================= TELEGRAM =================
    if (signals.length > 0) {
      let msg = "🔥 PRO TRADER HYBRID SIGNAL\n\n";
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
    console.error("❌ Scan error:", err.message);
  }
}

// ================= LOOP BOT =================
async function runBot() {
  console.log("🚀 Bot dimulai (PRO TRADER HYBRID MODE)");

  for (let i = 1; i <= LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i}`);
    await scan();
    await delay(LOOP_INTERVAL);
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
