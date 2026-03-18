const axios = require("axios");

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

    console.log("Total coin dari API:", res.data.length);

    const coins = res.data.filter(c =>
      c.price_change_percentage_24h > 0.3 &&
      c.total_volume > 1000000
    );

    console.log("Coin lolos filter:", coins.length);
    console.log("=== HASIL SCAN ===");

    coins.slice(0, 10).forEach(c => {
      console.log(
        `${c.symbol.toUpperCase()} | Harga: $${c.current_price} | Change: ${c.price_change_percentage_24h}% | Volume: ${c.total_volume}`
      );
    });

  } catch (err) {
    console.error("Error:", err.message);
  }
}

getCrypto();
