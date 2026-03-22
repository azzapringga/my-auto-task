const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram config
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Config
const USD_TO_IDR = 15000;
const LOOP_INTERVAL = 30000; // 30 detik
const LOOP_COUNT = 6;

// 🔥 Kurangi page (anti 429)
const PAGES = [1, 2, 3];

// TELEGRAM
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

// FETCH (ANTI 429)
async function fetchAllCoins() {
  try {
    let allCoins = [];

    for (let p of PAGES) {
      const res = await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
        params: {
          vs_currency: "usd",
          order: "volume_desc",
          per_page: 100,
          page: p
        },
        timeout: 10000
      });

      allCoins = allCoins.concat(res.data);

      // ⏳ Delay biar aman dari rate limit
      await new Promise(r => setTimeout(r, 1200));
    }

    return allCoins;

  } catch (err) {
    console.error("❌ Fetch error:", err.message);
    return [];
  }
}

// SCAN
async function scanMarket() {
  try {
    const coins = await fetchAllCoins();

    let oldData = {};
    if (fs.existsSync(FILE_JSON)) {
      oldData = JSON.parse(fs.readFileSync(FILE_JSON));
    }

    let newData = {};

    let fast = [];
    let early = [];
    let beruntun = [];
    let top = [];

    coins.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const priceUSD = c.current_price;
      const priceIDR = priceUSD * USD_TO_IDR;
      const volume = c.total_volume * USD_TO_IDR;

      let history = oldData[symbol] || [];
      if (!Array.isArray(history)) history = [history];

      history.push(priceUSD);
      history = history.slice(-5);
      newData[symbol] = history;

      const isCheap = priceIDR < 15000 && priceIDR > 50;

      // =====================
      // 🔥 FAST PUMP (PRIORITAS)
      // =====================
      if (history.length >= 2) {
        const prev = history[history.length - 2];
        const change1m = ((priceUSD - prev) / prev) * 100;

        if (change1m >= 2 && volume > 100000000) {
          fast.push({
            symbol,
            change: change1m.toFixed(2),
            price: priceIDR
          });
        }

        // 🟢 EARLY
        if (isCheap && change1m >= 0.5 && change1m < 2) {
          early.push({
            symbol,
            change: change1m.toFixed(2),
            price: priceIDR
          });
        }
      }

      // =====================
      // 🔼 BERUNTUN
      // =====================
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

      // =====================
      // 🏆 TOP GAINER (ANTI TELAT)
      // =====================
      if (
        c.price_change_percentage_24h >= 5 &&
        c.price_change_percentage_24h <= 25 && // ❌ buang yang terlalu tinggi (telat)
        history.length >= 2
      ) {
        const prev = history[history.length - 2];
        const nowChange = ((priceUSD - prev) / prev) * 100;

        if (nowChange > 0.5) {
          top.push({
            symbol,
            change: c.price_change_percentage_24h.toFixed(2),
            price: priceIDR
          });
        }
      }

    });

    // =====================
    // SORTING (BIAR RAPI)
    // =====================
    fast.sort((a,b)=>b.change - a.change);
    early.sort((a,b)=>b.change - a.change);
    beruntun.sort((a,b)=>b.totalChange - a.totalChange);
    top.sort((a,b)=>b.change - a.change);

    // =====================
    // TELEGRAM FORMAT
    // =====================
    let msg = "*🚀 CRYPTO SCANNER PRO (SMART FILTER)*\n\n";

    if (fast.length) {
      msg += "🔥 *FAST PUMP (REALTIME)*\n";
      fast.slice(0,10).forEach(c=>{
        msg += `*${c.symbol}* | +${c.change}% | Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      msg += "\n";
    }

    if (early.length) {
      msg += "🟢 *EARLY TREND*\n";
      early.slice(0,10).forEach(c=>{
        msg += `*${c.symbol}* | +${c.change}% | Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      msg += "\n";
    }

    if (beruntun.length) {
      msg += "🔼 *PUMP BERUNTUN*\n";
      beruntun.slice(0,10).forEach(c=>{
        msg += `*${c.symbol}* | +${c.totalChange}% | Vol: Rp${c.volume.toLocaleString("id-ID")} | Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      msg += "\n";
    }

    if (top.length) {
      msg += "🏆 *TOP GAINER (VALID)*\n";
      top.slice(0,10).forEach(c=>{
        msg += `*${c.symbol}* | +${c.change}% | Rp${c.price.toLocaleString("id-ID")}\n`;
      });
      msg += "\n";
    }

    if (fast.length + early.length + beruntun.length + top.length > 0) {
      await sendTelegram(msg);
    } else {
      console.log("⏳ Tidak ada sinyal...");
    }

    fs.writeFileSync(FILE_JSON, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  }
}

// LOOP
async function runBot() {
  console.log("🚀 Bot dimulai (SMART MODE)");

  for (let i = 0; i < LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i + 1}`);
    await scanMarket();

    if (i < LOOP_COUNT - 1) {
      await new Promise(r => setTimeout(r, LOOP_INTERVAL));
    }
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
