const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// CONFIG (🔥 SUDAH DISESUAIKAN BIAR ANTI 429)
const USD_TO_IDR = 15000;
const LOOP_COUNT = 4;           // lebih sedikit
const LOOP_INTERVAL = 30000;    // 30 detik (AMAN)
const PAGES = 1;                // 🔥 balik ke 1 page
const PER_PAGE = 50;

// Delay
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
async function fetchWithRetry(retries = 2) {
  try {
    return await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: {
        vs_currency: "usd",
        order: "volume_desc",
        per_page: PER_PAGE,
        page: 1
      },
      timeout: 10000
    });
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      console.log("⚠️ Kena limit, retry...");
      await delay(15000);
      return fetchWithRetry(retries - 1);
    }
    throw err;
  }
}

// ================= MAIN =================
async function getCrypto() {
  try {
    const res = await fetchWithRetry();

    let oldData = {};
    if (fs.existsSync(FILE_JSON)) {
      oldData = JSON.parse(fs.readFileSync(FILE_JSON));
    }

    let newData = {};
    let fast = [], early = [], micro = [];

    res.data.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const price = c.current_price;
      const priceIDR = price * USD_TO_IDR;
      const volume = c.total_volume * USD_TO_IDR;

      const history = oldData[symbol] || [];
      const last = history.slice(-1)[0];

      if (last) {
        const change = ((price - last) / last) * 100;

        // 🔥 FAST PUMP
        if (change > 1.2 && volume > 300000000) {
          fast.push({ symbol, change: change.toFixed(2), price: priceIDR });
        }

        // 🟢 EARLY MOMENTUM
        if (change > 0.3 && change <= 1.2 && volume > 150000000) {
          early.push({ symbol, change: change.toFixed(2), price: priceIDR });
        }

        // ⚪ MICRO TREND (awal banget)
        if (change > 0.15 && change <= 0.3 && volume > 100000000) {
          micro.push({ symbol, change: change.toFixed(2), price: priceIDR });
        }
      }

      newData[symbol] = [...history, price].slice(-3);
    });

    // ================= FORMAT TELEGRAM =================
    let msg = "🚀 CRYPTO SCANNER (EARLY MODE)\n\n";

    if (fast.length) {
      msg += "🔥 FAST PUMP\n";
      fast.forEach(c => {
        msg += `${c.symbol} | +${c.change}% | Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      msg += "\n";
    }

    if (early.length) {
      msg += "🟢 EARLY MOMENTUM\n";
      early.forEach(c => {
        msg += `${c.symbol} | +${c.change}% | Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      msg += "\n";
    }

    if (micro.length) {
      msg += "⚪ MICRO TREND\n";
      micro.forEach(c => {
        msg += `${c.symbol} | +${c.change}% | Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      msg += "\n";
    }

    if (fast.length || early.length || micro.length) {
      await sendTelegram(msg);
    } else {
      console.log("⏳ Tidak ada sinyal...");
    }

    fs.writeFileSync(FILE_JSON, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("❌ Fetch error:", err.message);
  }
}

// ================= LOOP =================
async function runBot() {
  console.log("🚀 Bot dimulai (EARLY MODE - STABLE)");

  for (let i = 1; i <= LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i}`);

    await getCrypto();

    await delay(LOOP_INTERVAL);
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
