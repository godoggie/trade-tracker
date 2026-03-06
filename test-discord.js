require("dotenv").config();

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
if (!webhookUrl) {
  console.error("No DISCORD_WEBHOOK_URL configured in .env");
  process.exit(1);
}

(async () => {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "NHL Trade Tracker: Test message - Discord notifications are working!",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Discord error (${res.status}): ${body}`);
    } else {
      console.log("Test message sent to Discord!");
    }
  } catch (err) {
    console.error(`Failed: ${err.message}`);
  }
})();
