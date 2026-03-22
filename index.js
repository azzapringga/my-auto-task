const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";
const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// CONFIG
const USD_TO_IDR = 15000;
const LOOP_COUNT = 6;
const LOOP_INTERVAL = 30000;
const PER_PAGE = 50;

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
    let signals = [];

    res.data.forEach(c => {
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

        // ❌ SKIP (terlalu tinggi = telat)
        if (change1 > 3) {
          label = "SKIP (TERLAMBAT)";
          emoji = "❌";
        }

        // 🚀 BREAKOUT (awal ledakan)
        else if (change1 > 0.4 && volumeSpike > 1.4) {
          label = "BREAKOUT";
          emoji = "🚀";
        }

        // ✅ VALID ENTRY (lebih stabil)
        else if (change1 > 0.25 && change2 > 0.1 && volumeSpike > 1.3) {
          label = "VALID ENTRY";
          emoji = "✅";
        }

        // ⚠️ RISKY
        else if (change1 > 0.15 && volumeSpike > 1.2) {
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

      newData[symbol] = [
        ...history,
        { price, volume }
      ].slice(-4);
    });

    // ================= JIKA ADA SIGNAL =================
    if (signals.length) {
      let msg = "🎯 CRYPTO SNIPER ADAPTIVE\n\n";

      signals.slice(0, 7).forEach(c => {
        msg += `${c.emoji} ${c.symbol} | +${c.change}% | 🔥x${c.spike}\n`;
        msg += `${c.label}\n💰 Rp${c.price.toLocaleString("id-ID")}\n\n`;
      });

      await sendTelegram(msg);
    }

    // ================= JIKA KOSONG → KIRIM KANDIDAT =================
    else {
      console.log("⚠️ Tidak ada sinyal kuat, kirim kandidat...");

      let msg = "📡 SNIPER WATCHLIST\n\n";

      res.data.slice(0, 5).forEach(c => {
        const priceIDR = c.current_price * USD_TO_IDR;
        msg += `${c.symbol.toUpperCase()} | Rp${priceIDR.toLocaleString("id-ID")}\n`;
      });

      await sendTelegram(msg);
    }

    fs.writeFileSync(FILE_JSON, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("❌ Fetch error:", err.message);
  }
}

// ================= LOOP =================
async function runBot() {
  console.log("🚀 Bot dimulai (SNIPER ADAPTIVE)");

  for (let i = 1; i <= LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i}`);
    await scan();
    await delay(LOOP_INTERVAL);
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
// Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// CONFIG
const USD_TO_IDR = 15000;
const LOOP_COUNT = 4;
const LOOP_INTERVAL = 30000;
const PER_PAGE = 50;

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
    let signals = [];

    res.data.forEach(c => {
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

        // ❌ SKIP (terlalu tinggi / telat)
        if (change1 > 5) {
          label = "SKIP (TERLAMBAT)";
          emoji = "❌";
        }

        // ✅ VALID ENTRY (BEST)
        else if (change1 > 0.3 && change2 > 0.2 && volumeSpike > 1.5) {
          label = "VALID ENTRY";
          emoji = "✅";
        }

        // ⚠️ RISKY
        else if (change1 > 0.2 && volumeSpike > 1.3) {
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

      newData[symbol] = [
        ...history,
        { price, volume }
      ].slice(-3);
    });

    // ================= FILTER =================
    if (!signals.length) {
      console.log("⏳ Tidak ada sinyal sniper...");
      fs.writeFileSync(FILE_JSON, JSON.stringify(newData, null, 2));
      return;
    }

    // ================= TELEGRAM =================
    let msg = "🎯 CRYPTO SNIPER MODE\n\n";

    signals.slice(0, 7).forEach(c => {
      msg += `${c.emoji} ${c.symbol} | +${c.change}% | 🔥x${c.spike}\n`;
      msg += `${c.label}\n💰 Rp${c.price.toLocaleString("id-ID")}\n\n`;
    });

    await sendTelegram(msg);

    fs.writeFileSync(FILE_JSON, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("❌ Fetch error:", err.message);
  }
}

// ================= LOOP =================
async function runBot() {
  console.log("🚀 Bot dimulai (SNIPER MODE)");

  for (let i = 1; i <= LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i}`);
    await scan();
    await delay(LOOP_INTERVAL);
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
