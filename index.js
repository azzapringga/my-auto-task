const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// CONFIG
const USD_TO_IDR = 15000;
const LOOP_COUNT = 4;
const LOOP_INTERVAL = 30000;
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
async function fetchData(retries = 2) {
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
      return fetchData(retries - 1);
    }
    throw err;
  }
}

// ================= MAIN =================
async function scan() {
  try {
    const res = await fetchData();

    let oldData = {};
    if (fs.existsSync(FILE_JSON)) {
      oldData = JSON.parse(fs.readFileSync(FILE_JSON));
    }

    let newData = {};

    let entry = [];
    let early = [];
    let micro = [];

    res.data.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const price = c.current_price;
      const volume = c.total_volume;

      const priceIDR = price * USD_TO_IDR;

      const history = oldData[symbol] || [];
      const last = history.slice(-1)[0];

      if (last) {
        const prevPrice = last.price;
        const prevVolume = last.volume || 1;

        const change = ((price - prevPrice) / prevPrice) * 100;
        const volumeSpike = volume / prevVolume;

        // 🔥 ENTRY (lebih sensitif)
        if (change > 0.3 && volumeSpike > 1.5) {
          entry.push({
            symbol,
            change: change.toFixed(2),
            spike: volumeSpike.toFixed(2),
            price: priceIDR
          });
        }

        // 🟢 EARLY
        else if (change > 0.2 && volumeSpike > 1.3) {
          early.push({
            symbol,
            change: change.toFixed(2),
            spike: volumeSpike.toFixed(2)
          });
        }

        // ⚪ MICRO
        else if (change > 0.1 && volumeSpike > 1.1) {
          micro.push({
            symbol,
            change: change.toFixed(2)
          });
        }
      }

      newData[symbol] = [
        ...history,
        { price, volume }
      ].slice(-3);
    });

    // ================= TELEGRAM =================
    let msg = "🚀 CRYPTO SCANNER (SMART SENSITIF)\n\n";

    if (entry.length) {
      msg += "🔥 *ENTRY SIGNAL*\n";
      entry.forEach(c => {
        msg += `${c.symbol} | +${c.change}% | 🔥x${c.spike}\n💰 Rp${c.price.toLocaleString("id-ID")}\n\n`;
      });
    }

    if (early.length) {
      msg += "🟢 EARLY MOMENTUM\n";
      early.forEach(c => {
        msg += `${c.symbol} | +${c.change}% | 🔥x${c.spike}\n`;
      });
      msg += "\n";
    }

    if (micro.length) {
      msg += "⚪ MICRO TREND\n";
      micro.forEach(c => {
        msg += `${c.symbol} | +${c.change}%\n`;
      });
      msg += "\n";
    }

    // 🔥 FALLBACK BIAR NGGAK SEPI
    if (!entry.length && !early.length && !micro.length) {
      let fallback = res.data.slice(0, 5);

      msg = "📊 MARKET UPDATE (TOP VOLUME)\n\n";

      fallback.forEach(c => {
        const priceIDR = c.current_price * USD_TO_IDR;
        msg += `${c.symbol.toUpperCase()} | Rp${priceIDR.toLocaleString("id-ID")}\n`;
      });
    }

    await sendTelegram(msg);

    fs.writeFileSync(FILE_JSON, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("❌ Fetch error:", err.message);
  }
}

// ================= LOOP =================
async function runBot() {
  console.log("🚀 Bot dimulai (SMART SENSITIF MODE)");

  for (let i = 1; i <= LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i}`);
    await scan();
    await delay(LOOP_INTERVAL);
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
