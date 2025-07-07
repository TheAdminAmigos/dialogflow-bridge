const express = require("express");
const WebSocket = require("ws");
const dialogflow = require("@google-cloud/dialogflow");
const uuid = require("uuid");

const app = express();
const port = process.env.PORT || 10000;

// ✅ Create Dialogflow session client
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

  ws.on("message", async (message) => {
    const parsed = JSON.parse(message);

    if (parsed.event === "start") {
      console.log("Streaming started.");
      // ✅ Create a new Dialogflow session for this call
      ws.dialogflowSession = sessionClient.projectAgentSessionPath(
        credentials.project_id,
        uuid.v4()
      );
    }

    if (parsed.event === "media") {
      console.log("Received audio chunk.");

      // ✅ Convert base64 payload to Buffer
      const audioBuffer = Buffer.from(parsed.media.payload, "base64");

      // ✅ Prepare request to Dialogflow
      const request = {
        session: ws.dialogflowSession,
        queryInput: {
          audioConfig: {
            audioEncoding: "AUDIO_ENCODING_LINEAR_16",
            sampleRateHertz: 8000,
            languageCode: "en-US"
          }
        },
        inputAudio: audioBuffer
      };

      try {
        const [response] = await sessionClient.detectIntent(request);
        const replyText = response.queryResult.fulfillmentText;
        console.log("Dialogflow response:", replyText);

        // ✅ Always send a simple constant mark event to keep the stream alive
        ws.send(JSON.stringify({
          event: "mark",
          name: "alive"
        }));

      } catch (err) {
        console.error("Dialogflow error:", err);
      }
    }

    if (parsed.event === "stop") {
      console.log("Streaming stopped.");
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed.");
  });
});
