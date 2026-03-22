const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// CONFIG
const USD_TO_IDR = 15000;
const LOOP_COUNT = 6;          // jumlah scan per action
const LOOP_INTERVAL = 20000;   // delay antar scan (20 detik)
const PAGES = 2;               // 🔥 scan 2 halaman
const PER_PAGE = 50;           // 50 koin per halaman

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

// ================= FETCH WITH RETRY =================
async function fetchWithRetry(page, retries = 3) {
  try {
    return await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: {
        vs_currency: "usd",
        order: "volume_desc", // fokus koin aktif
        per_page: PER_PAGE,
        page: page
      },
      timeout: 10000
    });
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      console.log("⚠️ Kena limit, retry...");
      await delay(10000);
      return fetchWithRetry(page, retries - 1);
    }
    throw err;
  }
}

// ================= MAIN =================
async function getCrypto() {
  try {
    let allCoins = [];

    // 🔥 ambil multi page
    for (let p = 1; p <= PAGES; p++) {
      const res = await fetchWithRetry(p);
      allCoins = allCoins.concat(res.data);

      await delay(2000); // jeda antar page
    }

    let oldData = {};
    if (fs.existsSync(FILE_JSON)) {
      oldData = JSON.parse(fs.readFileSync(FILE_JSON));
    }

    let newData = {};
    let fast = [], early = [];

    allCoins.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const price = c.current_price;
      const priceIDR = price * USD_TO_IDR;
      const volume = c.total_volume * USD_TO_IDR;

      const history = oldData[symbol] || [];
      const last = history.slice(-1)[0];

      if (last) {
        const change = ((price - last) / last) * 100;

        // 🔥 FAST PUMP (lonjakan cepat)
        if (change > 1.5 && volume > 500000000) {
          fast.push({
            symbol,
            change: change.toFixed(2),
            price: priceIDR
          });
        }

        // 🟢 EARLY MOMENTUM (awal naik)
        if (change > 0.5 && change < 1.5 && volume > 200000000) {
          early.push({
            symbol,
            change: change.toFixed(2),
            price: priceIDR
          });
        }
      }

      // simpan 3 histori terakhir
      newData[symbol] = [...history, price].slice(-3);
    });

    // ================= FORMAT TELEGRAM =================
    let msg = "🚀 CRYPTO SCANNER (SMART REALTIME)\n\n";

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

    if (fast.length || early.length) {
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
  console.log("🚀 Bot dimulai (SMART MODE - 100 COINS)");

  for (let i = 1; i <= LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i}`);

    await getCrypto();

    await delay(LOOP_INTERVAL); // 🔥 anti 429
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
