// index.js
import express from "express";
import xml from "xml";
import OpenAI from "openai";

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI();
const PORT = 10000;

const greeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";
const fillerPrompt = "One moment please...";

// Helper to build <Say>
const buildSay = (text) => ({
  Say: {
    _attr: { voice: "Polly.Emma-Neural" },
    _cdata: text,
  },
});

// 🎯 Endpoint: Answer the call
app.post("/voice", (req, res) => {
  console.log("📞 Incoming call");

  const twiml = xml(
    {
      Response: [
        buildSay(greeting),
        {
          Gather: {
            _attr: {
              input: "speech",
              action: "/gather",
              language: "en-GB",
              timeout: "1",
              speechTimeout: "auto",
              enhanced: "true",
            },
          },
        },
      ],
    },
    { declaration: true }
  );

  res.type("text/xml").send(twiml);
});

// 🎯 Endpoint: Handle Gathered Speech
app.post("/gather", async (req, res) => {
  const transcript = req.body.SpeechResult || "";
  console.log(`🗣️ User said: "${transcript}"`);

  if (!transcript) {
    const twiml = xml(
      {
        Response: [
          buildSay("Sorry, I didn't hear anything. Could you please repeat that?"),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather",
                language: "en-GB",
                timeout: "1",
                speechTimeout: "auto",
                enhanced: "true",
              },
            },
          },
        ],
      },
      { declaration: true }
    );
    return res.type("text/xml").send(twiml);
  }

  // Play filler prompt first
  const fillerTwiml = xml(
    {
      Response: [
        buildSay(fillerPrompt),
        {
          Redirect: {
            _cdata: "/respond?text=" + encodeURIComponent(transcript),
          },
        },
      ],
    },
    { declaration: true }
  );

  res.type("text/xml").send(fillerTwiml);
});

// 🎯 Endpoint: Generate GPT response and re-gather
app.post("/respond", async (req, res) => {
  const transcript = req.query.text || "";
  console.log(`⚡ Generating GPT reply for: "${transcript}"`);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a polite UK receptionist for Silver Birch Landscaping and Gardening. Answer briefly and helpfully.",
        },
        { role: "user", content: transcript },
      ],
    });

    const reply =
      completion.choices[0].message?.content?.trim() ||
      "I'm sorry, I didn't quite catch that.";

    console.log(`🤖 GPT Response: "${reply}"`);

    const twiml = xml(
      {
        Response: [
          buildSay(reply),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather",
                language: "en-GB",
                timeout: "1",
                speechTimeout: "auto",
                enhanced: "true",
              },
            },
          },
        ],
      },
      { declaration: true }
    );

    res.type("text/xml").send(twiml);
  } catch (err) {
    console.error("❌ GPT Error:", err);

    const errorTwiml = xml(
      {
        Response: [
          buildSay("Sorry, there was a problem. Could you please repeat that?"),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather",
                language: "en-GB",
                timeout: "1",
                speechTimeout: "auto",
                enhanced: "true",
              },
            },
          },
        ],
      },
      { declaration: true }
    );

    res.type("text/xml").send(errorTwiml);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
