import express from "express";
import { v4 as uuidv4 } from "uuid";
import { WebSocketServer } from "ws";
import xml from "xml";
import { SpeechClient } from "@google-cloud/speech";
import OpenAI from "openai";

// Initialize clients
const app = express();
const speechClient = new SpeechClient();
const openai = new OpenAI();
const wss = new WebSocketServer({ noServer: true });

// Express webhook for Twilio
app.use(express.urlencoded({ extended: true }));
app.post("/voice", (req, res) => {
  console.log("📞 Incoming call");

  const twiml = xml(
    {
      Response: [
        {
          Say: {
            _attr: { voice: "Polly.Amy-Neural" },
            _cdata: "Hello, Silver Birch Landscaping and Gardening. How can I help you?",
          },
        },
        {
          Start: {
            Stream: {
              _attr: { url: "wss://" + req.headers.host + "/media" },
            },
          },
        },
      ],
    },
    { declaration: true }
  );

  res.type("text/xml").send(twiml);
});

// Handle WebSocket upgrade
app.server = app.listen(10000, () => {
  console.log("🌐 Server listening on port 10000");
});
app.server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// WebSocket media stream
wss.on("connection", (ws) => {
  console.log("🔗 WebSocket connected");
  let recognizeStream;
  let buffer = [];

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg);

    if (data.event === "start") {
      console.log("▶️ Stream started");
      recognizeStream = speechClient
        .streamingRecognize({
          config: {
            encoding: "MULAW",
            sampleRateHertz: 8000,
            languageCode: "en-GB",
            speechContexts: [
              { phrases: ["quote", "grass cutting", "garden maintenance", "Silver Birch Landscaping", "price", "appointment", "hedge trimming", "lawn mowing", "gardening services"] }
            ],
          },
          interimResults: true,
        })
        .on("data", async (speechData) => {
          const transcript =
            speechData.results[0]?.alternatives[0]?.transcript || "";
          const isFinal = speechData.results[0]?.isFinal;

          if (transcript) {
            console.log(`💬 Transcript (${isFinal ? "Final" : "Interim"}): ${transcript}`);

            if (isFinal) {
              try {
                // Send transcript to GPT
                const completion = await openai.chat.completions.create({
                  model: "gpt-4o",
                  messages: [
                    {
                      role: "system",
                      content:
                        "You are a polite receptionist for a landscaping and gardening company in the UK. Answer questions helpfully and professionally.",
                    },
                    { role: "user", content: transcript },
                  ],
                });

                const gptResponse =
                  completion.choices[0].message?.content?.trim() ||
                  "I'm sorry, I didn't quite catch that. Could you repeat it please?";

                console.log(`🤖 GPT Response: ${gptResponse}`);

                // Build TwiML to speak reply
                const twiml = xml(
                  {
                    Response: [
                      {
                        Say: {
                          _attr: { voice: "Polly.Amy-Neural" },
                          _cdata: gptResponse,
                        },
                      },
                      {
                        Start: {
                          Stream: {
                            _attr: { url: "wss://" + ws._socket.server.options.servername + "/media" },
                          },
                        },
                      },
                    ],
                  },
                  { declaration: true }
                );

                ws.send(
                  JSON.stringify({
                    event: "twiml",
                    twiml: twiml,
                  })
                );
              } catch (err) {
                console.error("❌ GPT Error:", err);

                const fallbackTwiml = xml(
                  {
                    Response: [
                      {
                        Say: {
                          _attr: { voice: "Polly.Amy-Neural" },
                          _cdata:
                            "I'm sorry, there was a problem understanding you. Could you please repeat that?",
                        },
                      },
                    ],
                  },
                  { declaration: true }
                );

                ws.send(
                  JSON.stringify({
                    event: "twiml",
                    twiml: fallbackTwiml,
                  })
                );
              }
            }
          }
        });
    }

    if (data.event === "media") {
      const audio = Buffer.from(data.media.payload, "base64");
      if (recognizeStream) recognizeStream.write(audio);
    }

    if (data.event === "stop") {
      console.log("🛑 Stream stopped");
      if (recognizeStream) recognizeStream.end();
      ws.close();
    }
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket closed");
    if (recognizeStream) recognizeStream.end();
  });
});
