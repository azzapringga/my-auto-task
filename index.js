const axios = require("axios");
const fs = require("fs");

const FILE = "data.json";

// 🔥 ambil dari GitHub Secrets
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ==============================
// 📩 FUNCTION TELEGRAM
// ==============================
async function sendTelegram(message) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.log("❌ Telegram config tidak ada");
    await sendTelegram("✅ BOT SUDAH TERHUBUNG - TEST");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
    });
    console.log("✅ Pesan Telegram terkirim");
  } catch (err) {
    console.error("❌ Error Telegram:", err.message);
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
        page: 2
      },
      timeout: 10000
    });

    console.timeEnd("Fetch API");

    let oldData = {};
    if (fs.existsSync(FILE)) {
      oldData = JSON.parse(fs.readFileSync(FILE));
    }

    let newData = {};
    let results = [];

    res.data.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const price = c.current_price;
      const isCheap = price < 1;

      // ==============================
      // 🔥 PUMP BERUNTUN
      // ==============================
      if (oldData[symbol] && oldData[symbol].length === 2) {
        const [price20m, price10m] = oldData[symbol];
        const priceNow = price;

        const change1 = ((price10m - price20m) / price20m) * 100;
        const change2 = ((priceNow - price10m) / price10m) * 100;

        if (
          isCheap &&
          change1 > 0.15 &&
          change2 > 0.15 &&
          c.total_volume > 500000 &&
          c.price_change_percentage_24h > 0
        ) {
          results.push({
            symbol,
            change1,
            change2,
            totalChange: change1 + change2,
            price: priceNow,
            volume: c.total_volume
          });
        }
      }

      // ==============================
      // 💾 SIMPAN DATA
      // ==============================
      if (!oldData[symbol]) {
        newData[symbol] = [price];
      } else {
        let history = oldData[symbol];

        if (!Array.isArray(history)) {
          history = [history];
        }

        const updated = [...history, price].slice(-2);
        newData[symbol] = updated;
      }
    });

    // ==============================
    // 📊 OUTPUT
    // ==============================
    console.log("==================================");
    console.log("🚀 MID CAP PUMP DETECTOR (< $1)");
    console.log("==================================");
    console.log("Total coin:", res.data.length);
    console.log("Terdeteksi:", results.length);

    let message = "🚀 CRYPTO PUMP ALERT\n\n";

    results
      .sort((a, b) => b.totalChange - a.totalChange)
      .slice(0, 5)
      .forEach(c => {
        const line = `${c.symbol} | +${c.totalChange.toFixed(2)}% | Vol: ${c.volume}`;
        console.log(line);
        message += line + "\n";
      });

    if (results.length === 0) {
      console.log("Tidak ada pump beruntun terdeteksi.");
    }

    // ==============================
    // 📩 KIRIM TELEGRAM (HANYA JIKA ADA HASIL)
    // ==============================
    if (results.length > 0) {
      await sendTelegram(message);
    }

    // ==============================
    // 💾 SAVE DATA
    // ==============================
    fs.writeFileSync(FILE, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  }
}

getCrypto();
