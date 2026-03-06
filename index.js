require("dotenv").config();
const cron = require("node-cron");
const cheerio = require("cheerio");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const NHL_URL = "https://www.nhl.com/news/2025-26-nhl-trades";
const DATA_DIR = path.join(__dirname, "data");
const TRADES_FILE = path.join(DATA_DIR, "trades.json");

// --- Logging ---

const LOG_FILE = path.join(DATA_DIR, "tracker.log");

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// --- Storage ---

function loadSeenTrades() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TRADES_FILE)) {
    return new Set();
  }
  const data = JSON.parse(fs.readFileSync(TRADES_FILE, "utf-8"));
  return new Set(data);
}

function saveSeenTrades(seenSet) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(TRADES_FILE, JSON.stringify([...seenSet], null, 2));
}

// --- Scraping ---

function hashTrade(text) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function fetchTrades() {
  const res = await fetch(NHL_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch NHL page: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const selectors = [
    "article",
    ".article-item__body",
    ".article__body",
    '[data-testid="article-body"]',
    ".nhl-c-article__body",
    ".content-body",
    "main",
  ];

  let articleHtml = "";
  for (const sel of selectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 200) {
      articleHtml = el.html();
      break;
    }
  }

  if (!articleHtml) {
    articleHtml = $.html();
  }

  const $article = cheerio.load(articleHtml);
  const fullText = $article.text();

  const tradePattern =
    /\b(JAN(?:UARY)?\.?|FEB(?:RUARY)?\.?|MARCH|APRIL|MAY|JUNE|JULY|AUG(?:UST)?\.?|SEPT(?:EMBER)?\.?|OCT(?:OBER)?\.?|NOV(?:EMBER)?\.?|DEC(?:EMBER)?\.?)\s+\d{1,2}:/gi;

  const matches = [...fullText.matchAll(tradePattern)];
  const trades = [];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : fullText.length;
    let tradeText = fullText.slice(start, end).trim();

    tradeText = tradeText.replace(/\s+/g, " ").replace(/\*+/g, "").trim();

    const pipeIdx = tradeText.indexOf("|");
    if (pipeIdx !== -1) {
      tradeText = tradeText.slice(0, pipeIdx).trim();
    }

    if (
      tradeText.toLowerCase().includes("acquire") ||
      tradeText.toLowerCase().includes("trade") ||
      tradeText.toLowerCase().includes("claim") ||
      tradeText.toLowerCase().includes("send")
    ) {
      trades.push(tradeText);
    }
  }

  return trades;
}

// --- Notifications ---

async function sendDiscord(message) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    log("  No DISCORD_WEBHOOK_URL configured, skipping notification.");
    return;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message.slice(0, 2000) }),
    });

    if (!res.ok) {
      const body = await res.text();
      log(`  Discord error (${res.status}): ${body}`);
    } else {
      log("  Discord notification sent.");
    }
  } catch (err) {
    log(`  Failed to send Discord notification: ${err.message}`);
  }
}

// --- Main check loop ---

async function checkForNewTrades() {
  log("Checking for new trades...");

  let trades;
  try {
    trades = await fetchTrades();
  } catch (err) {
    log(`Error fetching trades: ${err.message}`);
    return;
  }

  log(`Found ${trades.length} total trades on page.`);

  const seen = loadSeenTrades();
  const newTrades = [];

  for (const trade of trades) {
    const hash = hashTrade(trade);
    if (!seen.has(hash)) {
      seen.add(hash);
      newTrades.push(trade);
    }
  }

  if (newTrades.length > 0) {
    log(`${newTrades.length} NEW trade(s) detected!`);
    for (const trade of newTrades) {
      log(`-> ${trade.slice(0, 100)}...`);
      await sendDiscord(trade);
    }
    saveSeenTrades(seen);
  } else {
    log("No new trades.");
  }
}

// --- Startup ---

async function main() {
  log("=== NHL Trade Tracker ===");
  log(`Monitoring: ${NHL_URL}`);

  const interval = parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 5;
  log(`Poll interval: every ${interval} minute(s)`);

  // Baseline: catalog all current trades without sending notifications
  log("Establishing baseline...");
  try {
    const trades = await fetchTrades();
    const seen = loadSeenTrades();
    for (const trade of trades) {
      seen.add(hashTrade(trade));
    }
    saveSeenTrades(seen);
    log(`Baseline set: ${trades.length} existing trades cataloged.`);
  } catch (err) {
    log(`Error establishing baseline: ${err.message}`);
  }

  // Send startup notification to verify Discord is working
  await sendDiscord("NHL Trade Tracker is online! You'll be notified of new trades.");

  // Then schedule periodic checks
  cron.schedule(`*/${interval} * * * *`, checkForNewTrades);
  log("Scheduler running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
