const express = require("express");
const WebSocket = require("ws");
const dialogflow = require("@google-cloud/dialogflow");
const uuid = require("uuid");

const app = express();
const port = process.env.PORT || 10000;

const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
const sessionClient = new dialogflow.SessionsClient({ credentials });

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
    console.log("RAW MESSAGE:", message);

    if (!message) {
      console.warn("Received undefined or empty message, ignoring.");
      return;
    }

    if (typeof message !== "string") {
      console.warn("Received non-string message, ignoring.");
      return;
    }

    if (message.trim().length === 0) {
      console.warn("Received blank string message, ignoring.");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch (err) {
      console.warn("Received non-JSON string message, ignoring.");
      return;
    }

    console.log("Parsed JSON message:", parsed);

    if (parsed.event === "start") {
      console.log("Streaming started.");
      ws.dialogflowSession = sessionClient.projectAgentSessionPath(
        credentials.project_id,
        uuid.v4()
      );
    }

    if (parsed.event === "media") {
      console.log("Received audio chunk.");
    }

    if (parsed.event === "stop") {
      console.log("Streaming stopped.");
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed.");
  });
});
