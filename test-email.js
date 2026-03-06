require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const recipients = (process.env.NOTIFY_EMAILS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

if (!recipients.length) {
  console.error("No email recipients configured in .env (NOTIFY_EMAILS)");
  process.exit(1);
}

(async () => {
  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: recipients.join(","),
      subject: "NHL Trade Tracker - Test",
      text: "This is a test email. NHL Trade Tracker notifications are working!",
    });
    console.log(`Test email sent to: ${recipients.join(", ")}`);
  } catch (err) {
    console.error(`Failed to send: ${err.message}`);
  }
})();
