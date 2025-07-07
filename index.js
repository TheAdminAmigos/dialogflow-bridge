// index.js
const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Serve TwiML instructions to Twilio when a call starts
app.post("/", (req, res) => {
  console.log("✅ Received Twilio HTTP POST");

  res.type("text/xml");
  res.send(`
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media"/>
      </Start>
      <Say voice="alice">Hi Martyn, I'm listening!</Say>
      <Pause length="600"/>
    </Response>
  `);
});

// Create the WebSocket server to receive media
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  ws.on("message", (message) => {
    const msg = JSON.parse(message);
    if (msg.event === "start") {
      console.log("🔹 Event: start");
      console.log("🟢 Call started:", JSON.stringify(msg.start, null, 2));
    } else if (msg.event === "media") {
      const audioBuffer = Buffer.from(msg.media.payload, "base64");
      console.log("🔊 Received audio buffer (first 10 bytes):", audioBuffer.slice(0, 10));
      // Here is where you would process or forward the aud
