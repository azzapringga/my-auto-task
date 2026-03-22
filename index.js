const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// CONFIG (AMAN DARI 429)
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

    let fast = [];
    let early = [];
    let micro = [];
    let entry = [];

    res.data.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const price = c.current_price;
      const volume = c.total_volume;

      const priceIDR = price * USD_TO_IDR;
      const volumeIDR = volume * USD_TO_IDR;

      const history = oldData[symbol] || [];
      const last = history.slice(-1)[0];

      if (last) {
        const prevPrice = last.price;
        const prevVolume = last.volume || 1;

        const change = ((price - prevPrice) / prevPrice) * 100;
        const volumeSpike = volume / prevVolume;

        // 🔥 FAST PUMP
        if (change > 1.5 && volumeIDR > 300000000) {
          fast.push({ symbol, change: change.toFixed(2), price: priceIDR });
        }

        // 🟢 EARLY MOMENTUM (volume spike)
        if (change > 0.4 && volumeSpike > 1.5) {
          early.push({
            symbol,
            change: change.toFixed(2),
            spike: volumeSpike.toFixed(2),
            price: priceIDR
          });
        }

        // ⚪ MICRO TREND
        if (change > 0.15 && change <= 0.4 && volumeSpike > 1.2) {
          micro.push({
            symbol,
            change: change.toFixed(2),
            price: priceIDR
          });
        }

        // 🚀 ENTRY SIGNAL (INI YANG PALING PENTING)
        if (change > 0.5 && volumeSpike > 2) {
          entry.push({
            symbol,
            change: change.toFixed(2),
            spike: volumeSpike.toFixed(2),
            price: priceIDR
          });
        }
      }

      newData[symbol] = [
        ...history,
        { price, volume }
      ].slice(-3);
    });

    // ================= TELEGRAM =================
    let msg = "🚀 CRYPTO SCANNER PRO (SMART ENTRY)\n\n";

    if (entry.length) {
      msg += "🔥 *ENTRY SIGNAL (POTENSI NAIK)* 🔥\n";
      entry.forEach(c => {
        msg += `${c.symbol} | +${c.change}% | 🔥x${c.spike}\n💰 Entry: Rp${c.price.toLocaleString("id-ID")}\n\n`;
      });
    }

    if (fast.length) {
      msg += "🚀 FAST PUMP\n";
      fast.forEach(c => {
        msg += `${c.symbol} | +${c.change}% | Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      msg += "\n";
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

    if (entry.length || fast.length || early.length || micro.length) {
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
  console.log("🚀 Bot dimulai (SMART MODE + ENTRY)");

  for (let i = 1; i <= LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i}`);
    await scan();
    await delay(LOOP_INTERVAL);
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
