require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // FIX for ECONNREFUSED querySrv

const mongoose = require('mongoose');
const { GiftCatalog } = require('./models');

const MONGO_URI = process.env.MONGO_URI.trim();

const gifts = [
  { key: "pebble", name: "Pebble", priceUSD: 0.05, priceNGN: 66, receiverUSD: 0.035, platformUSD: 0.015, tier: "micro", animation: "small" },
  { key: "rose", name: "Rose", priceUSD: 0.1, priceNGN: 133, receiverUSD: 0.07, platformUSD: 0.03, tier: "sweet", animation: "small" },
  { key: "heart", name: "Heart", priceUSD: 0.5, priceNGN: 663, receiverUSD: 0.35, platformUSD: 0.15, tier: "sweet", animation: "small" },
  { key: "crown", name: "Crown", priceUSD: 1, priceNGN: 1327, receiverUSD: 0.7, platformUSD: 0.3, tier: "flex", animation: "banner" },
  { key: "car", name: "Sports Car", priceUSD: 5, priceNGN: 6635, receiverUSD: 3.5, platformUSD: 1.5, tier: "flex", animation: "banner" },
  { key: "diamond", name: "Diamond", priceUSD: 10, priceNGN: 13270, receiverUSD: 7, platformUSD: 3, tier: "legendary", animation: "fullscreen" },
  { key: "lion", name: "Lion King", priceUSD: 20, priceNGN: 26540, receiverUSD: 14, platformUSD: 6, tier: "legendary", animation: "fullscreen" },
  { key: "mansion", name: "Kedu Mansion", priceUSD: 40, priceNGN: 53080, receiverUSD: 28, platformUSD: 12, tier: "whale", animation: "fullscreen" },
  { key: "moneyRain", name: "Money Rain", priceUSD: 75, priceNGN: 99525, receiverUSD: 52.5, platformUSD: 22.5, tier: "whale", animation: "rain" },
  { key: "universe", name: "Kedu Universe", priceUSD: 100, priceNGN: 132700, receiverUSD: 70, platformUSD: 30, tier: "god", animation: "appwide" }
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected ✅");
  await GiftCatalog.deleteMany({});
  await GiftCatalog.insertMany(gifts);
  console.log("SUCCESS: 10 gifts inserted ✅");
  process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); });