const axios = require("axios");
const fs = require("fs");

const FILE = "data.json";

// Ambil dari GitHub Secrets
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ==============================
// 📩 FUNCTION TELEGRAM DENGAN DEBUG
// ==============================
async function sendTelegram(message) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.log("❌ Telegram config tidak ada");
    console.log("TOKEN:", TELEGRAM_TOKEN ? "OK" : "MISSING");
    console.log("CHAT_ID:", CHAT_ID ? "OK" : "MISSING");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  try {
    const res = await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
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
    let results = [];

    res.data.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const price = c.current_price;
      const isCheap = price < 1;

      // 🔁 Pump beruntun
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

      // 💾 Simpan data terbaru
      let history = oldData[symbol] || [];
      if (!Array.isArray(history)) history = [history];
      const updated = [...history, price].slice(-2);
      newData[symbol] = updated;
    });

    // ==============================
    // 📊 OUTPUT & MESSAGE TELEGRAM
    // ==============================
    console.log("==================================");
    console.log("🚀 MID CAP PUMP DETECTOR (< $1)");
    console.log("==================================");
    console.log("Total coin:", res.data.length);
    console.log("Terdeteksi:", results.length);
    //await sendTelegram("✅ BOT SUDAH TERHUBUNG - TEST");

    let message = "🚀 CRYPTO PUMP ALERT\n\n";

    if (results.length > 0) {
      results
        .sort((a, b) => b.totalChange - a.totalChange)
        .slice(0, 5)
        .forEach(c => {
          const line = `${c.symbol} | +${c.totalChange.toFixed(2)}% | Vol: ${c.volume}`;
          console.log(line);
          message += line + "\n";
        });

      // Kirim ke Telegram
      await sendTelegram(message);
    } else {
      console.log("Tidak ada pump beruntun terdeteksi.");
      // 🔹 Untuk test Telegram, bisa aktifkan baris ini sementara:
      // await sendTelegram("✅ BOT SUDAH TERHUBUNG - TEST");
    }

    // 💾 Simpan data baru
    fs.writeFileSync(FILE, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  }
}

getCrypto();
