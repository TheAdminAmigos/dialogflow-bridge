import express from "express";
import xml from "xml";
import { WebSocketServer } from "ws";
import http from "http";

const port = process.env.PORT || 10000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.urlencoded({ extended: true }));

// Twilio webhook endpoint
app.post("/voice", (req, res) => {
  console.log("📞 Incoming call");

  const response = xml([
    { Response: [
      { Say: "Please hold while we connect you." },
      { Start: [
        { Stream: [
          { _attr: {
            url: `wss://${req.headers.host}/media`
          }}
        ]}
      ]},
      { Pause: [{ _attr: { length: "60" } }] }
    ]}
  ]);

  res.type("text/xml");
  res.send(response);
});

// WebSocket handling
wss.on("connection", (ws) => {
  console.log("✅ WebSocket connected");

  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.event === "start") {
      console.log("🔹 Start event received");
    }
    if (msg.event === "media") {
      console.log(`🎙️ Media event – Payload length: ${msg.media.payload.length}`);
    }
    if (msg.event === "stop") {
      console.log("🔴 Stop event received");
    }
  });

  ws.on("close", () => {
    console.log("❎ WebSocket disconnected");
  });
});

server.listen(port, () => {
  console.log(`🌐 Server listening on port ${port}`);
});
