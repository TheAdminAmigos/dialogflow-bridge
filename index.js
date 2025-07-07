const express = require("express");
const WebSocket = require("ws");

const app = express();
const port = process.env.PORT || 10000;

// This handles the initial HTTP POST from Twilio
app.use(express.urlencoded({ extended: false }));

app.post("/", (req, res) => {
  console.log("✅ Received Twilio HTTP POST");
  res.type("text/xml");
  res.send(`
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media"/>
      </Start>
      <Say voice="alice">Hi Martyn, I'm listening!</Say>
    </Response>
  `);
});

// Start the HTTP server
const server = app.listen(port, () => {
  console.log(`🌐 Express server listening on port ${port}`);
});

// Attach WebSocket server to same HTTP server
const wss = new WebSocket.Server({ server, path: "/media" });

wss.on("connection", function connection(ws) {
  console.log("✅ WebSocket connection established");

  ws.on("message", function incoming(message) {
    let data;
    try {
      data = JSON.parse(message.toString());
    } catch (err) {
      console.error("❌ Failed to parse incoming message:", err);
      return;
    }

    console.log("🔹 Event:", data.event);

    if (data.event === "media" && data.media && data.media.payload) {
      const audioBuffer = Buffer.from(data.media.payload, "base64");
      console.log("🔊 Received audio buffer (first 10 bytes):", audioBuffer.slice(0, 10));
    }

    if (data.event === "start") {
      console.log("🟢 Call started:", JSON.stringify(data.start, null, 2));
    }

    if (data.event === "stop") {
      console.log("🔴 Call stopped.");
    }
  });

  ws.on("close", function close() {
    console.log("❎ WebSocket connection closed");
  });
});
