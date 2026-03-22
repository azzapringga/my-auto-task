const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram config dari GitHub Secrets
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Default fallback kurs (jika gagal fetch)
let USD_TO_IDR = 16000;

// CONFIG BOT
const LOOP_COUNT = 6;        // berapa kali scan per job
const LOOP_INTERVAL = 30000; // jeda antar scan (ms)
const PER_PAGE = 50;          // jumlah koin per halaman

const delay = ms => new Promise(res => setTimeout(res, ms));

// ==================== FETCH KURS HARI INI ====================
async function fetchUSDToIDR() {
  try {
    const res = await axios.get("https://api.exchangerate.host/latest?base=USD&symbols=IDR");
    USD_TO_IDR = res.data.rates.IDR;
    console.log("✅ Kurs USD->IDR hari ini:", USD_TO_IDR.toFixed(2));
  } catch (err) {
    console.error("❌ Gagal fetch kurs, pakai default:", USD_TO_IDR);
  }
}

// ==================== TELEGRAM ====================
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

// ==================== FETCH DATA KOIN ====================
async function fetchCoins(page = 1, retries = 2) {
  try {
    return await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: {
        vs_currency: "usd",
        order: "volume_desc",
        per_page: PER_PAGE,
        page,
      },
      timeout: 10000
    });
  } catch (err) {
    if (err.response?.status === 429 && retries > 0) {
      console.log("⚠️ Kena limit, retry...");
      await delay(15000);
      return fetchCoins(page, retries - 1);
    }
    throw err;
  }
}

// ==================== SCAN & SIGNAL ====================
async function scan() {
  try {
    // fetch 2 halaman untuk lebih banyak koin
    const res1 = await fetchCoins(1);
    const res2 = await fetchCoins(2);
    const allCoins = [...res1.data, ...res2.data];

    // load data lama
    let oldData = {};
    if (fs.existsSync(FILE_JSON)) oldData = JSON.parse(fs.readFileSync(FILE_JSON));

    let newData = {};
    let signals = [];

    allCoins.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const priceUSD = c.current_price;
      const priceIDR = priceUSD * USD_TO_IDR;
      const volume = c.total_volume;

      const history = oldData[symbol] || [];

      if (history.length >= 2) {
        const prev = history[history.length - 1];
        const prev2 = history[history.length - 2];

        const change1 = ((priceUSD - prev.price) / prev.price) * 100;
        const change2 = ((prev.price - prev2.price) / prev2.price) * 100;
        const volumeSpike = volume / (prev.volume || 1);

        let label = "";
        let emoji = "";

        if (change1 > 5) {
          label = "SKIP (TERLAMBAT)";
          emoji = "❌";
        } else if (change1 > 0.3 && change2 > 0.2 && volumeSpike > 1.5) {
          label = "VALID ENTRY";
          emoji = "✅";
        } else if (change1 > 0.2 && volumeSpike > 1.3) {
          label = "RISKY";
          emoji = "⚠️";
        } else if (change1 > 0.15 && volumeSpike > 1.2) {
          label = "WATCH";
          emoji = "👀";
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

      newData[symbol] = [...history, { price: priceUSD, volume }].slice(-4);
    });

    // ==================== TELEGRAM ====================
    if (signals.length) {
      let msg = "🔥 PRO TRADER SIGNAL\n\n";
      signals
        .sort((a,b)=>b.change-a.change)
        .slice(0, 7)
        .forEach(c => {
          msg += `${c.emoji} ${c.symbol} | +${c.change}% | 🔥x${c.spike}\n`;
          msg += `${c.label}\n💰 Rp${c.price.toLocaleString("id-ID")}\n\n`;
        });
      await sendTelegram(msg);
    } else {
      console.log("⚠️ Tidak ada sinyal kuat");
    }

    fs.writeFileSync(FILE_JSON, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("❌ Fetch error:", err.message);
  }
}

// ==================== LOOP BOT ====================
async function runBot() {
  console.log("🚀 Bot dimulai (PRO TRADER MODE)");

  // ambil kurs USD->IDR hari ini sekali
  await fetchUSDToIDR();

  for (let i = 1; i <= LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i}`);
    await scan();
    await delay(LOOP_INTERVAL);
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
