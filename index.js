require("dotenv").config();
const cron = require("node-cron");
const cheerio = require("cheerio");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const NHL_URL = "https://www.nhl.com/news/2025-26-nhl-trades";
const DATA_DIR = path.join(__dirname, "data");
const TRADES_FILE = path.join(DATA_DIR, "trades.json");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

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

  // The article body contains all the trades.
  // Each trade is a text block starting with a bold date like "MARCH 5:"
  // We grab all text from the article content area.
  const trades = [];

  // Try multiple possible selectors for the article body
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
    // Fallback: use the entire page
    articleHtml = $.html();
  }

  // Parse individual trades from the HTML text content.
  // Trades follow the pattern: **DATE:** description
  const $article = cheerio.load(articleHtml);
  const fullText = $article.text();

  // Split on the bold date pattern: "MONTH DAY:" (e.g., "MARCH 5:", "FEB. 28:")
  const tradePattern =
    /\b(JAN(?:UARY)?\.?|FEB(?:RUARY)?\.?|MARCH|APRIL|MAY|JUNE|JULY|AUG(?:UST)?\.?|SEPT(?:EMBER)?\.?|OCT(?:OBER)?\.?|NOV(?:EMBER)?\.?|DEC(?:EMBER)?\.?)\s+\d{1,2}:/gi;

  const matches = [...fullText.matchAll(tradePattern)];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : fullText.length;
    let tradeText = fullText.slice(start, end).trim();

    // Clean up whitespace and stray markdown bold markers
    tradeText = tradeText.replace(/\s+/g, " ").replace(/\*+/g, "").trim();

    // Remove trailing link text after "|" if present
    const pipeIdx = tradeText.indexOf("|");
    if (pipeIdx !== -1) {
      tradeText = tradeText.slice(0, pipeIdx).trim();
    }

    // Only include entries that look like actual trades
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

function getNotifyEmails() {
  const raw = process.env.NOTIFY_EMAILS || "";
  return raw.split(",").map((e) => e.trim()).filter(Boolean);
}

async function sendEmail(trade) {
  const recipients = getNotifyEmails();
  if (!recipients.length) return;

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: recipients.join(","),
      subject: "NHL Trade Alert",
      text: trade,
    });
    console.log(`  Email sent to: ${recipients.join(", ")}`);
  } catch (err) {
    console.error(`  Failed to send email: ${err.message}`);
  }
}

// --- Main check loop ---

async function checkForNewTrades() {
  const now = new Date().toLocaleString();
  console.log(`\n[${now}] Checking for new trades...`);

  let trades;
  try {
    trades = await fetchTrades();
  } catch (err) {
    console.error(`  Error fetching trades: ${err.message}`);
    return;
  }

  console.log(`  Found ${trades.length} total trades on page.`);

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
    console.log(`  ${newTrades.length} NEW trade(s) detected!`);
    for (const trade of newTrades) {
      console.log(`  -> ${trade.slice(0, 100)}...`);

      await sendEmail(trade);
    }
    saveSeenTrades(seen);
  } else {
    console.log("  No new trades.");
  }
}

// --- Startup ---

async function main() {
  console.log("=== NHL Trade Tracker ===");
  console.log(`Monitoring: ${NHL_URL}`);

  const interval = parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 5;
  console.log(`Poll interval: every ${interval} minute(s)`);
  const emails = getNotifyEmails();
  console.log(`Notifications: ${emails.length ? emails.join(", ") : "(not set)"}`);

  // Run immediately on startup
  await checkForNewTrades();

  // Then schedule periodic checks
  cron.schedule(`*/${interval} * * * *`, checkForNewTrades);
  console.log("\nScheduler running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
