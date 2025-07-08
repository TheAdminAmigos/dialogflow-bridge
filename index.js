// index.js
const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

// Load Google Cloud clients
const speech = require("@google-cloud/speech");
const textToSpeech = require("@google-cloud/text-to-speech");

// Parse credentials from environment variable
const googleCredentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

// Initialize clients
const speechClient = new speech.SpeechClient({
  credentials: {
    client_email: googleCredentials.client_email,
    private_key: googleCredentials.private_key
  },
  projectId: googleCredentials.project_id
});

const ttsClient = new textToSpeech.TextToSpeechClient({
  credentials: {
    client_email: googleCredentials.client_email,
    private_key: googleCredentials.private_key
  },
  projectId: googleCredentials.project_id
});

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Serve TwiML instructions to Twilio
app.post("/", (req, res) => {
  console.log("✅ Received Twilio HTTP POST");

  res.type("text/xml");
  res.send(`
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media"/>
      </Start>
      <Say voice="Polly.Joanna">Hi, this is your AI Assistant. Please speak now.</Say>
      <Pause length="60"/>
    </Response>
  `);
});

// Create WebSocket server
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  ws.on("message", async (message) => {
    const msg = JSON.parse(message);

    if (msg.event === "start") {
      console.log("🔹 Event: start");
    } else if (msg.event === "media") {
      const audioBuffer = Buffer.from(msg.media.payload, "base64");
      console.log("🎙️ Received audio chunk.");

      // When audio comes in, synthesize TTS (static text)
      const [response] = await ttsClient.synthesizeSpeech({
        input: { text: "Hello! This is your test message from Callie. Your setup is working perfectly." },
        voice: {
          languageCode: "en-GB",
          name: "en-GB-Chirp3-HD-Callirrhoe"
        },
        audioConfig: {
          audioEncoding: "MULAW",
          sampleRateHertz: 8000
        }
      });

      // Send audio back as base64
      ws.send(JSON.stringify({
        event: "media",
        media: {
          payload: response.audioContent.toString("base64")
        }
      }));

      console.log("🗣️ Sent static TTS audio.");
    } else if (msg.event === "stop") {
      console.log("🔴 Call stopped.");
    }
  });

  ws.on("close", () => {
    console.log("❎ WebSocket connection closed");
  });
});

// Upgrade HTTP to WebSocket
const server = app.listen(process.env.PORT || 10000, () => {
  console.log(`🌐 Express server listening on port ${process.env.PORT || 10000}`);
});

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/media") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});
