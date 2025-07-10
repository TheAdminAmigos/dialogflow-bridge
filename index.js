// index.js
require("dotenv").config();

const fs = require("fs");
const express = require("express");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const { Configuration, OpenAIApi } = require("openai");

// Load Google Cloud clients
const speech = require("@google-cloud/speech");

// Read and parse the credentials JSON file
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
console.log("DEBUG: GOOGLE_APPLICATION_CREDENTIALS =", credentialsPath);
const googleCredentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));

const speechClient = new speech.SpeechClient({
  credentials: {
    client_email: googleCredentials.client_email,
    private_key: googleCredentials.private_key,
  },
  projectId: googleCredentials.project_id,
});

// Initialize OpenAI
const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

const app = express();
app.use(morgan("dev"));
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
      <Say voice="Polly.Joanna">Hi, this is your AI Assistant. I'm listening now.</Say>
      <Pause length="60"/>
    </Response>
  `);
});

// Create WebSocket server
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  let transcriptBuffer = "";

  const recognizeStream = speechClient
    .streamingRecognize({
      config: {
        encoding: "MULAW",
        sampleRateHertz: 8000,
        languageCode: "en-GB",
      },
      interimResults: false,
    })
    .on("error", (err) => console.error("❌ STT Error:", err))
    .on("data", (data) => {
      const transcript = data.results[0]?.alternatives[0]?.transcript || "";
      if (transcript.trim()) {
        console.log(`📝 Transcript chunk: ${transcript}`);
        transcriptBuffer += transcript + " ";
      }
    });

  ws.on("message", async (message) => {
    const msg = JSON.parse(message);

    if (msg.event === "start") {
      console.log("🔹 Event: start");
    } else if (msg.event === "media") {
      const audioBuffer = Buffer.from(msg.media.payload, "base64");
      recognizeStream.write(audioBuffer);
    } else if (msg.event === "stop") {
      console.log("🔴 Call stopped. Finalizing transcription...");
      recognizeStream.destroy();
      ws.close();

      if (transcriptBuffer.trim()) {
        console.log(`✅ Final Transcript: ${transcriptBuffer}`);

        // Generate GPT reply
        try {
          const gptResponse = await openai.createChatCompletion({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "You are a helpful receptionist answering customer queries." },
              { role: "user", content: transcriptBuffer },
            ],
          });
          const replyText = gptResponse.data.choices[0].message.content;
          console.log(`💬 GPT Reply: ${replyText}`);
        } catch (error) {
          console.error("❌ GPT Error:", error);
        }
      } else {
        console.log("⚠️ No transcript captured.");
      }
    }
  });

  ws.on("close", () => {
    console.log("❎ WebSocket connection closed");
  });
});

// Upgrade HTTP to WebSocket
const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 Express server listening on port ${process.env.PORT || 3000}`);
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
