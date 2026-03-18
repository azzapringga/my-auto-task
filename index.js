const axios = require("axios");
const fs = require("fs");

const FILE = "data.json";

// Ambil dari GitHub Secrets
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Kurs Rupiah
const USD_TO_IDR = 15000;

// ==============================
// 📩 FUNCTION TELEGRAM
// ==============================
async function sendTelegram(message) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.log("❌ Telegram config tidak ada");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  try {
    const res = await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown"
    });
    console.log("✅ Pesan Telegram terkirim:", res.data.ok ? "OK" : "FAILED");
  } catch (err) {
    console.error("❌ Error Telegram:", err.response?.data || err.message);
  }
}

// ==============================
// 🚀 MAIN FUNCTION
// ==============================
async function getCrypto() {
  try {
    console.time("Fetch API");

    const res = await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: {
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: 100,
        page: 2 // mid cap
      },
      timeout: 10000
    });

    console.timeEnd("Fetch API");

    let oldData = {};
    if (fs.existsSync(FILE)) {
      oldData = JSON.parse(fs.readFileSync(FILE));
    }

    let newData = {};
    let early = [], beruntun = [], big = [];

    res.data.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const priceUSD = c.current_price;
      const price = priceUSD * USD_TO_IDR; // ubah ke Rupiah
      const isCheap = price < 15000; // filter koin murah < Rp 15,000

      // 🔹 EARLY PUMP
      if (oldData[symbol] && oldData[symbol].length >= 1) {
        const pricePrev = oldData[symbol].slice(-1)[0];
        const change = ((price - pricePrev) / pricePrev) * 100;

        if (isCheap && change >= 0.1 && change < 0.5) {
          early.push({ symbol, change, price });
        }
      }

      // 🔁 PUMP BERUNTUN
      if (oldData[symbol] && oldData[symbol].length === 2) {
        const [price20m, price10m] = oldData[symbol];
        const priceNow = price;

        const change1 = ((price10m - price20m) / price20m) * 100;
        const change2 = ((priceNow - price10m) / price10m) * 100;

        if (
          isCheap &&
          change1 > 0.15 &&
          change2 > 0.15 &&
          c.total_volume * USD_TO_IDR > 500000000 &&
          c.price_change_percentage_24h > 0
        ) {
          beruntun.push({
            symbol,
            change1,
            change2,
            totalChange: change1 + change2,
            price: priceNow,
            volume: c.total_volume * USD_TO_IDR
          });
        }
      }

      // 💥 BIG PUMP
      if (isCheap && price > 1.1 * (oldData[symbol]?.slice(-1)[0] || 0) && c.total_volume * USD_TO_IDR > 1000000000) {
        big.push({ symbol, price, volume: c.total_volume * USD_TO_IDR });
      }

      // 💾 Simpan data baru
      let history = oldData[symbol] || [];
      if (!Array.isArray(history)) history = [history];
      const updated = [...history, price].slice(-2);
      newData[symbol] = updated;
    });

    // ==============================
    // 📊 FORMAT PESAN TELEGRAM
    // ==============================
    let message = "*🚀 CRYPTO PUMP ALERT (IDR)*\n\n";

    const formatLine = (c, isBeruntun = false) => {
      const priceStr = `Rp${c.price.toLocaleString("id-ID")}`;
      if (isBeruntun) {
        return `*${c.symbol}* | 🔁 +${c.totalChange.toFixed(2)}% | Vol: Rp${c.volume.toLocaleString("id-ID")} | ${priceStr}`;
      }
      return `*${c.symbol}* | +${(c.change || 0).toFixed(2)}% | ${priceStr}`;
    };

    if (early.length > 0) {
      message += "🟢 *EARLY PUMP*\n";
      early.forEach(c => message += formatLine(c) + "\n");
      message += "\n";
    }

    if (beruntun.length > 0) {
      message += "🟡 *PUMP BERUNTUN*\n";
      beruntun.forEach(c => message += formatLine(c, true) + "\n");
      message += "\n";
    }

    if (big.length > 0) {
      message += "🔴 *BIG PUMP*\n";
      big.forEach(c => {
        const priceStr = `Rp${c.price.toLocaleString("id-ID")}`;
        message += `*${c.symbol}* | Vol: Rp${c.volume.toLocaleString("id-ID")} | ${priceStr}\n`;
      });
      message += "\n";
    }

    if (early.length + beruntun.length + big.length > 0) {
      await sendTelegram(message);
    } else {
      console.log("Tidak ada pump terdeteksi saat ini.");
    }

    // 💾 simpan data JSON
    fs.writeFileSync(FILE, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  }
}

getCrypto();
