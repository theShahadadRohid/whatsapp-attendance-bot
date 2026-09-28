const express = require("express");
require("dotenv").config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 5000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// Test route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "WhatsApp Attendance Bot API is running",
  });
});

// WhatsApp webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");

    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// WhatsApp webhook events
app.post("/webhook", (req, res) => {
  console.log("WhatsApp webhook received:");
  console.log(JSON.stringify(req.body, null, 2));

  // Always respond quickly to Meta
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
