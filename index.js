import express from "express";
import { WebSocketServer } from "ws";
import xml from "xml";
import { v4 as uuidv4 } from "uuid";
import { SpeechClient } from "@google-cloud/speech";
import OpenAI from "openai";

const app = express();
const port = 10000;

// Configure OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure Google Cloud Speech client
const speechClient = new SpeechClient();

// Keep track of active WebSocket connections
const connections = new Map();

// Create HTTP server with Express
app.use(express.urlencoded({ extended: true }));

// Endpoint Twilio hits on incoming call
app.post("/voice", (req, res) => {
  console.log("📞 Incoming call");

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural">
    Hello, Silver Birch Landscaping and Gardening, how can I help you?
  </Say>
  <Start>
    <Stream url="wss://${req.headers.host}/media" />
  </Start>
</Response>`;

  res.type("text/xml");
  res.send(twiml);
});

// Create WebSocket server for media stream
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket connections
wss.on("connection", (ws) => {
  console.log("🔗 WebSocket connected");

  // Unique ID per connection
  const connectionId = uuidv4();
  connections.set(connectionId, { ws });

  // Start streaming recognizer
  const recognizeStream = speechClient
    .streamingRecognize({
      config: {
        encoding: "MULAW",
        sampleRateHertz: 8000,
        languageCode: "en-US",
      },
      interimResults: false,
    })
    .on("error", console.error)
    .on("data", async (data) => {
      const transcript = data.results[0]?.alternatives[0]?.transcript;
      if (transcript) {
        console.log(`💬 Transcript: ${transcript}`);

        // Send transcript to OpenAI
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a polite and helpful receptionist for Silver Birch Landscaping and Gardening. Answer questions clearly.",
            },
            { role: "user", content: transcript },
          ],
        });

        const reply = completion.choices[0].message.content.trim();
        console.log(`🤖 GPT Reply: ${reply}`);

        // Send <Say> response back to Twilio
        const responseXml = xml(
          {
            Response: [{ Say: reply }],
          },
          { declaration: true }
        );

        ws.send(
          JSON.stringify({
            event: "mark",
            name: "twiml",
            data: responseXml,
          })
        );
      }
    });

  // Handle incoming media messages
  ws.on("message", (msg) => {
    const data = JSON.parse(msg);
    if (data.event === "media") {
      const audio = Buffer.from(data.media.payload, "base64");
      recognizeStream.write(audio);
    } else if (data.event === "stop") {
      console.log("🔴 Stop event received");
      recognizeStream.destroy();
      ws.close();
    }
  });

  ws.on("close", () => {
    console.log("❎ WebSocket disconnected");
    connections.delete(connectionId);
  });
});

// Upgrade HTTP server to accept WebSocket connections
app.server = app.listen(port, () => {
  console.log(`🌐 Server listening on port ${port}`);
});
app.server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});
