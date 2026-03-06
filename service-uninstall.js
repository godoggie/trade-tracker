const Service = require("node-windows").Service;
const path = require("path");

const svc = new Service({
  name: "NHL Trade Tracker",
  description: "Monitors NHL trades and sends email notifications",
  script: path.join(__dirname, "index.js"),
});

svc.on("uninstall", () => {
  console.log("Service uninstalled.");
});

svc.uninstall();
