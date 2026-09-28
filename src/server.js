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
  const entry = req.body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  const message = value?.messages?.[0];

  // No message in this webhook
  if (!message) {
    return res.sendStatus(200);
  }

  const from = message.from;
  const messageId = message.id;
  const messageTimestamp = message.timestamp;
  const messageType = message.type;
  const text = message.text?.body?.trim();

  console.log("WhatsApp message received:");
  console.log({
    from,
    messageId,
    messageTimestamp,
    messageType,
    text,
  });

  if (messageType === "text" && text?.toUpperCase() === "CHECK IN") {
    const checkInTime = new Date();

    console.log("CHECK IN detected!");
    console.log("Employee:", from);
    console.log("Check-in time:", checkInTime.toISOString());
  }

  // Always respond quickly to Meta
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
