// Quick test: fetches the NHL page and prints parsed trades (no Twilio needed)
const cheerio = require("cheerio");

const NHL_URL = "https://www.nhl.com/news/2025-26-nhl-trades";

async function fetchTrades() {
  console.log(`Fetching ${NHL_URL}...\n`);
  const res = await fetch(NHL_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
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
  let matchedSelector = "entire page (fallback)";
  for (const sel of selectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 200) {
      articleHtml = el.html();
      matchedSelector = sel;
      break;
    }
  }

  if (!articleHtml) {
    articleHtml = $.html();
  }

  console.log(`Matched selector: "${matchedSelector}"`);
  console.log(`HTML length: ${articleHtml.length}\n`);

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

fetchTrades()
  .then((trades) => {
    console.log(`Found ${trades.length} trades:\n`);
    trades.slice(0, 10).forEach((t, i) => {
      console.log(`${i + 1}. ${t}\n`);
    });
    if (trades.length > 10) {
      console.log(`... and ${trades.length - 10} more.`);
    }
    console.log("\nScraping works! Configure .env and run 'npm start' to begin monitoring.");
  })
  .catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
