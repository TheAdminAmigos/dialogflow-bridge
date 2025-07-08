// index.js
const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

// Load Google Cloud client library
const speech = require("@google-cloud/speech");

// Parse the credentials JSON from the environment variable
const googleCredentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

// Create the Speech-to-Text client
const client = new speech.SpeechClient({
  credentials: {
    client_email: googleCredentials.client_email,
    private_key: googleCredentials.private_key
  },
  projectId: googleCredentials.project_id
});

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

// Create WebSocket server
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  // Create a streaming recognize request
  const recognizeStream = client
    .streamingRecognize({
      config: {
        encoding: "MULAW",
        sampleRateHertz: 8000,
        languageCode: "en-GB"
      },
      interimResults: true
    })
    .on("error", (err) => {
      console.error("❌ Speech recognition error:", err);
    })
    .on("data", (data) => {
      const transcript = data.results[0]?.alternatives[0]?.transcript;
      if (transcript) {
        console.log(`📝 Transcript: ${transcript}`);
      }
    });

  ws.on("message", (message) => {
    const msg = JSON.parse(message);
    if (msg.event === "start") {
      console.log("🔹 Event: start");
      console.log("🟢 Call started:", JSON.stringify(msg.start, null, 2));
    } else if (msg.event === "media") {
      const audioBuffer = Buffer.from(msg.media.payload, "base64");
      recognizeStream.write(audioBuffer);
    } else if (msg.event === "stop") {
      console.log("🔴 Call stopped.");
      recognizeStream.end();
    }
  });

  ws.on("close", () => {
    console.log("❎ WebSocket connection closed");
    recognizeStream.end();
  });
});

// Upgrade HTTP requests to WebSocket for /media
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
