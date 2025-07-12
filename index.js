import express from "express";
import xml from "xml";
import OpenAI from "openai";

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI();

const PORT = 10000;

// Initial greeting
const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";

// Longer friendly filler
const longFiller = "Alright, thanks—let me just open my system so I can check that for you. One moment.";

// Fallback if GPT slow
const fallbackPrompt = "Sorry for the wait—modern technology is great until you're trying to be quick, lol!";

// Build TwiML snippet
const buildSay = (text) => ({
  Say: {
    _attr: { voice: "Polly.Emma-Neural" },
    _cdata: text,
  },
});

// 🎯 Answer the call
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

// 🎯 Handle Gathered Speech
app.post("/gather", async (req, res) => {
  const transcript = req.body.SpeechResult || "";
  console.log(`🗣️ User said: "${transcript}"`);

  // Track if GPT has responded
  let gptReply = null;
  let gptDone = false;

  // Start GPT generation in the background
  const gptPromise = openai.chat.completions
    .create({
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
    })
    .then((completion) => {
      gptReply =
        completion.choices[0].message?.content?.trim() ||
        "I'm sorry, I didn't quite catch that.";
      gptDone = true;
      console.log(`🤖 GPT Response: "${gptReply}"`);
    })
    .catch((err) => {
      console.error("❌ GPT Error:", err);
      gptReply =
        "I'm sorry, there was an issue understanding that. Could you please repeat?";
      gptDone = true;
    });

  // Immediately send the longer filler
  const fillerTwiml = xml(
    {
      Response: [
        buildSay(longFiller),
        {
          Gather: {
            _attr: {
              input: "speech",
              action: "/followup",
              language: "en-GB",
              timeout: "3",
              speechTimeout: "auto",
              enhanced: "true",
            },
          },
        },
      ],
    },
    { declaration: true }
  );

  res.type("text/xml").send(fillerTwiml);

  // Wait up to 3 seconds for GPT
  await Promise.race([
    gptPromise,
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);

  // Nothing else to do—user will re-trigger /followup
});

// 🎯 Handle follow-up Gather
app.post("/followup", async (req, res) => {
  const transcript = req.body.SpeechResult || "";
  console.log(`🗣️ Follow-up user said: "${transcript}"`);

  // Check if GPT had finished during the filler
  if (typeof gptReply === "string" && gptReply.trim()) {
    // Speak GPT reply + re-gather
    const twiml = xml(
      {
        Response: [
          buildSay(gptReply),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather",
                language: "en-GB",
                timeout: "2",
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
  } else {
    // GPT still not done—use fallback
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
                enhanced: "true",
              },
            },
          },
        ],
      },
      { declaration: true }
    );

    res.type("text/xml").send(twiml);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
