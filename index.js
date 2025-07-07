const express = require("express");
const WebSocket = require("ws");

const app = express();
const port = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: false }));

app.post("/", (req, res) => {
  console.log("Received Twilio HTTP POST.");
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

const server = app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});

const wss = new WebSocket.Server({ server, path: "/media" });

wss.on("connection", (ws) => {
  console.log("WebSocket connection established.");

  ws.on("message", (message) => {
    console.log("RAW MESSAGE RECEIVED:", message);
    return;
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed.");
  });
});
