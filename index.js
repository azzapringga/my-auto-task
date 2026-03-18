const axios = require("axios");
const fs = require("fs");

const FILE = "data.json";

async function getCrypto() {
  try {
    console.time("Fetch API");

    const res = await axios.get("https://api.coingecko.com/api/v3/coins/markets", {
      params: {
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: 100,
        page: 2 // 🔥 mid cap
      },
      timeout: 10000
    });

    console.timeEnd("Fetch API");

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

      // tandai koin murah
      const isCheap = price < 1;

      // ==============================
      // 🔁 PUMP BERUNTUN (HANYA FILTER)
      // ==============================
      if (oldData[symbol] && oldData[symbol].length === 2) {
        const [price20m, price10m] = oldData[symbol];
        const priceNow = price;

        const change1 = ((price10m - price20m) / price20m) * 100;
        const change2 = ((priceNow - price10m) / price10m) * 100;

        if (
          isCheap &&                 // 🔥 filter di sini (bukan di atas)
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
      // 💾 SIMPAN DATA (SEMUA KOIN)
      // ==============================
      if (!oldData[symbol]) {
        newData[symbol] = [price];
      } else {
        let history = oldData[symbol];

        // fix format lama
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
    console.log("Total coin (API):", res.data.length);
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
    // 💾 SIMPAN DATA BARU
    // ==============================
    fs.writeFileSync(FILE, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  }
}

getCrypto();
