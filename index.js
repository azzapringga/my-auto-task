const axios = require("axios");
const fs = require("fs");

const FILE = "data.json";

async function getCrypto() {
  try {
    const res = await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: {
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: 100,
        page: 1
      }
    });

    // ambil data lama
    let oldData = {};
    if (fs.existsSync(FILE)) {
      oldData = JSON.parse(fs.readFileSync(FILE));
    }

    let newData = {};
    let results = [];

    res.data.forEach(c => {
      const symbol = c.symbol.toUpperCase();
      const price = c.current_price;

      // ==============================
      // 🔁 LOGIKA PUMP BERUNTUN
      // ==============================
      if (oldData[symbol] && oldData[symbol].length === 2) {
        const [price20m, price10m] = oldData[symbol];
        const priceNow = price;

        const change1 = ((price10m - price20m) / price20m) * 100;
        const change2 = ((priceNow - price10m) / price10m) * 100;

        // 🔥 FILTER PUMP BERUNTUN
        if (
          change1 > 0.2 &&
          change2 > 0.2 &&
          c.total_volume > 800000 &&
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
      // 💾 SIMPAN 2 DATA TERAKHIR
      // ==============================
      if (!oldData[symbol]) {
  newData[symbol] = [price];
} else {
  let history = oldData[symbol];

  // 🔥 FIX: kalau masih format lama (number)
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
    console.log("🚀 PUMP BERUNTUN (20 MENIT)");
    console.log("==================================");
    console.log("Total coin:", res.data.length);
    console.log("Terdeteksi:", results.length);
    console.log("");

    results
      .sort((a, b) => b.totalChange - a.totalChange)
      .slice(0, 10)
      .forEach(c => {
        console.log(
          `${c.symbol} | 10m1: +${c.change1.toFixed(2)}% | 10m2: +${c.change2.toFixed(2)}% | Total: +${c.totalChange.toFixed(2)}% | Vol: ${c.volume} | $${c.price}`
        );
      });

    if (results.length === 0) {
      console.log("Tidak ada pump beruntun terdeteksi.");
    }

    // ==============================
    // 💾 SIMPAN DATA TERBARU
    // ==============================
    fs.writeFileSync(FILE, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  }
}

getCrypto();
