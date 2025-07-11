import express from "express";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";
import xml from "xml";
import { SpeechClient } from "@google-cloud/speech";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));
const port = 10000;

// Twilio /voice webhook
app.post("/voice", (req, res) => {
  const response = xml(
    {
      Response: [
        {
          Start: [
            {
              Stream: [
                {
                  _attr: {
                    url: `wss://${req.headers.host}/media`
                  }
                }
              ]
            }
          ]
        },
        { Say: "Please hold while I connect you." }
      ]
    },
    { declaration: true }
  );
  res.type("text/xml").send(response);
});

// WebSocket server
const wss = new WebSocketServer({ noServer: true });
const speechClient = new SpeechClient();
const openai = new OpenAI();

// For each WebSocket connection
wss.on("connection", (ws) => {
  console.log("🔗 WebSocket connected");

  let recognizeStream = null;
  let transcriptBuffer = "";

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      console.log("📞 Call started");

      recognizeStream = speechClient
        .streamingRecognize({
          config: {
            encoding: "MULAW",
            sampleRateHertz: 8000,
            languageCode: "en-US"
          },
          interimResults: false
        })
        .on("error", console.error)
        .on("data", async (res) => {
          const transcript = res.results[0]?.alternatives[0]?.transcript;
          if (transcript) {
            console.log(`💬 Transcript: ${transcript}`);
            transcriptBuffer += " " + transcript;

            // Send transcript to GPT
            const completion = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                { role: "system", content: "You are a helpful phone assistant." },
                { role: "user", content: transcriptBuffer.trim() }
              ]
            });

            const gptReply = completion.choices[0].message.content;
            console.log(`💬 GPT Reply: ${gptReply}`);

            // Send TwiML <Say> back to Twilio
            const twiml = xml(
              {
                Response: [
                  { Say: gptReply }
                ]
              },
              { declaration: true }
            );
            ws.send(
              JSON.stringify({
                event: "media",
                media: {
                  payload: Buffer.from(twiml).toString("base64")
                }
              })
            );

            // Clear transcript buffer for next round
            transcriptBuffer = "";
          }
        });
    }

    if (data.event === "media") {
      if (recognizeStream) {
        const audio = Buffer.from(data.media.payload, "base64");
        recognizeStream.write(audio);
      }
    }

    if (data.event === "stop") {
      console.log("🔴 Stop event received");
      if (recognizeStream) {
        recognizeStream.end();
      }
      ws.close();
    }
  });
});

// HTTP server upgrade for WebSocket
const server = app.listen(port, () => {
  console.log(`🌐 Server listening on port ${port}`);
});
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/media") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});
