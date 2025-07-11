import express from "express";
import { WebSocketServer } from "ws";
import xml from "xml";
import { v4 as uuidv4 } from "uuid";
import { SpeechClient } from "@google-cloud/speech";

const app = express();
const port = process.env.PORT || 10000;

// Serve TwiML when Twilio calls your webhook
app.post("/voice", express.urlencoded({ extended: false }), (req, res) => {
  const response = xml(
    {
      Response: [
        {
          Start: [
            { _attr: { "stream-url": `wss://${req.headers.host}/media` } }
          ]
        },
        { Say: "Please wait while I connect you." }
      ]
    },
    { declaration: true }
  );
  res.type("text/xml").send(response);
});

// Create WebSocket server for audio streaming
const wss = new WebSocketServer({ noServer: true });

// Initialize Google Speech client
const speechClient = new SpeechClient();

wss.on("connection", (ws) => {
  console.log("🔗 WebSocket connected");

  // Create a recognize stream
  const recognizeStream = speechClient
    .streamingRecognize({
      config: {
        encoding: "MULAW",
        sampleRateHertz: 8000,
        languageCode: "en-US"
      },
      interimResults: true
    })
    .on("error", (err) => console.error("🎤 Speech error:", err))
    .on("data", (data) => {
      if (data.results[0] && data.results[0].alternatives[0]) {
        const transcript = data.results[0].alternatives[0].transcript;
        console.log(`💬 Transcript: ${transcript}`);

        // Reply back to the caller with the transcript (just for testing)
        const response = xml(
          {
            Response: [
              {
                Say: `You said: ${transcript}`
              }
            ]
          },
          { declaration: true }
        );

        ws.send(
          JSON.stringify({
            event: "media",
            media: {
              payload: Buffer.from(response).toString("base64")
            }
          })
        );
      }
    });

  ws.on("message", (message) => {
    const msg = JSON.parse(message);

    if (msg.event === "start") {
      console.log("📞 Call started");
    }

    if (msg.event === "media" && msg.media && msg.media.payload) {
      const audio = Buffer.from(msg.media.payload, "base64");
      recognizeStream.write(audio);
    }

    if (msg.event === "stop") {
      console.log("🔴 Call ended");
      recognizeStream.destroy();
      ws.close();
    }
  });

  ws.on("close", () => {
    console.log("❎ WebSocket closed");
  });
});

// Upgrade HTTP server to handle WebSocket connections
const server = app.listen(port, () => {
  console.log(`🌐 Server listening on port ${port}`);
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
