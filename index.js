const axios = require("axios");
const fs = require("fs");

const FILE_JSON = "data.json";

// Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// CONFIG (HEMAT MODE)
const USD_TO_IDR = 15000;
const LOOP_COUNT = 2;           // 🔥 hemat
const LOOP_INTERVAL = 60000;    // 1 menit
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
async function fetchData() {
  return await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
    params: {
      vs_currency: "usd",
      order: "volume_desc",
      per_page: PER_PAGE,
      page: 1
    },
    timeout: 10000
  });
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
    let candidates = [];

    res.data.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const price = c.current_price;
      const volume = c.total_volume;

      const history = oldData[symbol] || [];

      if (history.length >= 2) {
        const prev = history[history.length - 1];
        const prev2 = history[history.length - 2];

        const change1 = ((price - prev.price) / prev.price) * 100;
        const change2 = ((prev.price - prev2.price) / prev2.price) * 100;

        const volumeSpike = volume / (prev.volume || 1);

        // ================= SCORING =================
        let score =
          (change1 * 2) +
          (change2 * 1.5) +
          ((volumeSpike - 1) * 5);

        score = Math.max(0, Math.min(10, score));

        // ================= FILTER MINIMUM =================
        if (change1 > 0.15 && volumeSpike > 1.1) {
          let label = "WATCH";
          let emoji = "📡";

          if (score > 7) {
            label = "STRONG BUY";
            emoji = "🚀";
          } else if (score > 5) {
            label = "BUY";
            emoji = "🟢";
          } else if (score > 3) {
            label = "EARLY";
            emoji = "🟡";
          }

          candidates.push({
            symbol,
            change: change1.toFixed(2),
            spike: volumeSpike.toFixed(2),
            price: price * USD_TO_IDR,
            score: score.toFixed(1),
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

    // ================= SORT TERBAIK =================
    candidates.sort((a, b) => b.score - a.score);

    let msg = "🔥 PRO TRADER SIGNAL\n\n";

    if (candidates.length) {
      candidates.slice(0, 3).forEach(c => {
        msg += `${c.emoji} ${c.symbol} | +${c.change}%\n`;
        msg += `Score: ${c.score}/10 | 🔥x${c.spike}\n`;
        msg += `${c.label}\n`;
        msg += `💰 Rp${c.price.toLocaleString("id-ID")}\n\n`;
      });
    } else {
      msg += "📊 MARKET SEPI\nTidak ada momentum kuat\n\n";
    }

    await sendTelegram(msg);

    fs.writeFileSync(FILE_JSON, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// ================= LOOP =================
async function runBot() {
  console.log("🚀 Bot dimulai (PRO TRADER MODE)");

  for (let i = 1; i <= LOOP_COUNT; i++) {
    console.log(`\n⏱️ Scan ke-${i}`);
    await scan();
    await delay(LOOP_INTERVAL);
  }

  console.log("✅ Selesai 1 siklus");
}

runBot();
