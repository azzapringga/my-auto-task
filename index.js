const axios = require("axios");

async function getCrypto() {
  try {
    const res = await axios.get("https://api.binance.com/api/v3/ticker/24hr");

    // filter contoh (mirip yang kamu pakai sebelumnya)
    const coins = res.data.filter(c =>
      parseFloat(c.priceChangePercent) > 0.3 &&
      parseFloat(c.quoteVolume) > 1000000
    );

    console.log("=== HASIL SCAN ===");
    coins.slice(0, 10).forEach(c => {
      console.log(`${c.symbol} | Change: ${c.priceChangePercent}% | Volume: ${c.quoteVolume}`);
    });

  } catch (err) {
    console.error("Error:", err.message);
  }
}

getCrypto();
