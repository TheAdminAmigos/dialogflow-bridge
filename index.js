// Option A – Final Stable Turn-Based Bot
// Clean Gather + Response Loop Only

import express from "express";
import xml from "xml";
import OpenAI from "openai";

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI();

const PORT = 10000;

// Initial greeting
const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";

// Fallback prompt
const fallbackPrompt = "Sorry for the wait—modern technology is great until you're trying to be quick lol! Could you please repeat that?";

// Build Say TwiML
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
        buildSay(initialGreeting),
        {
          Gather: {
            _attr: {
              input: "speech",
              action: "/gather",
              language: "en-GB",
              timeout: "2",
              speechTimeout: "auto",
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
  console.log(`🗣️ User said: \"${transcript}\"`);

  if (!transcript) {
    // Re-prompt if nothing heard
    const twiml = xml(
      {
        Response: [
          buildSay(fallbackPrompt),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather",
                language: "en-GB",
                timeout: "2",
                speechTimeout: "auto",
              },
            },
          },
        ],
      },
      { declaration: true }
    );
    return res.type("text/xml").send(twiml);
  }

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

    console.log(`🤖 GPT Response: \"${reply}\"`);

    // Build TwiML reply
    const responseTwiml = xml(
      {
        Response: [
          buildSay(reply),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather",
                language: "en-GB",
                timeout: "2",
                speechTimeout: "auto",
              },
            },
          },
        ],
      },
      { declaration: true }
    );

    res.type("text/xml").send(responseTwiml);
  } catch (err) {
    console.error("❌ GPT Error:", err);

    const errorTwiml = xml(
      {
        Response: [
          buildSay("I'm sorry, something went wrong. Could you please say that again?"),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather",
                language: "en-GB",
                timeout: "2",
                speechTimeout: "auto",
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
