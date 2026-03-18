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

      if (oldData[symbol]) {
        const oldPrice = oldData[symbol];
        const change = ((price - oldPrice) / oldPrice) * 100;

        if (change > 0.3) {
          results.push({
            symbol,
            change: change.toFixed(2),
            price
          });
        }
      }
    });

    console.log("=== CHANGE 10 MENIT ===");

    results
      .sort((a, b) => b.change - a.change)
      .slice(0, 10)
      .forEach(c => {
        console.log(`${c.symbol} | ${c.change}% | Harga: $${c.price}`);
      });

    // simpan data baru
    fs.writeFileSync(FILE, JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error("Error:", err.message);
  }
}

getCrypto();
