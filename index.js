const express = require("express");
const WebSocket = require("ws");

const app = express();
const port = process.env.PORT || 10000;

// Middleware to parse URL-encoded data (Twilio sends POST as form data)
app.use(express.urlencoded({ extended: false }));

// Twilio POST handler
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

// Start the HTTP server
const server = app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});

// Create the WebSocket server
const wss = new WebSocket.Server({ server, path: "/media" });

// Handle incoming WebSocket connections
wss.on("connection", (ws) => {
  console.log("WebSocket connection established.");

  ws.on("message", (message) => {
    console.log("Received WebSocket message:");
    console.log(message.toString());
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed.");
  });
});
