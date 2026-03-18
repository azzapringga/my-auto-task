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

      newData[symbol] = price;

      // kalau ada data sebelumnya → hitung perubahan
      if (oldData[symbol]) {
        const oldPrice = oldData[symbol];
        const change = ((price - oldPrice) / oldPrice) * 100;

        // 🔥 FILTER PUMP DETECTOR
        if (
          change > 0.5 &&                    // naik cepat (10 menit)
          c.total_volume > 1000000 &&       // volume besar
          c.price_change_percentage_24h > 1 // tren harian naik
        ) {
          results.push({
            symbol,
            change: change,
            price,
            volume: c.total_volume
          });
        }
      }
    });

    console.log("==================================");
    console.log("🚀 PUMP DETECTOR (10 MENIT)");
    console.log("==================================");
    console.log("Total coin dari API:", res.data.length);
    console.log("Coin terdeteksi:", results.length);
    console.log("");

    // urutkan dari yang paling tinggi
    results
      .sort((a, b) => b.change - a.change)
      .slice(0, 10)
      .forEach(c => {
        console.log(
          `${c.symbol} | +${c.change.toFixed(2)}% | Vol: ${c.volume} | Harga: $${c.price}`
        );
      });

    if (results.length === 0) {
      console.log("Tidak ada pump terdeteksi saat ini.");
    }

    // simpan data terbaru
    fs.writeFileSync(FILE, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  }
}

getCrypto();
