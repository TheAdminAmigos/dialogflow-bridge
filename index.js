import express from "express";
import xml from "xml";
import OpenAI from "openai";

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI();
const PORT = process.env.PORT || 10000;

const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";
const noResponsePrompt = "I didn’t quite catch that—could you please repeat?";
const goodbyePrompt = "It seems we’re having trouble hearing each other, so I’ll end the call now. One of the team will follow up shortly. Thank you and goodbye.";

const buildSay = (text) => ({
  Say: {
    _attr: { voice: "Polly.Emma-Neural" },
    _cdata: text,
  },
});

// Answer the call
app.post("/voice", (req, res) => {
  const twiml = xml(
    {
      Response: [
        buildSay(initialGreeting),
        {
          Gather: {
            _attr: {
              input: "speech",
              action: "/gather?attempt=1",
              language: "en-GB",
              timeout: "5",
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

// Handle gathered speech
app.post("/gather", async (req, res) => {
  const transcript = req.body.SpeechResult || "";
  const attempt = parseInt(req.query.attempt || "1", 10);
  console.log(`🗣️ User said: "${transcript}"`);

  if (!transcript) {
    if (attempt >= 3) {
      const twiml = xml(
        { Response: [buildSay(goodbyePrompt)] },
        { declaration: true }
      );
      return res.type("text/xml").send(twiml);
    } else {
      const twiml = xml(
        {
          Response: [
            buildSay(noResponsePrompt),
            {
              Gather: {
                _attr: {
                  input: "speech",
                  action: `/gather?attempt=${attempt + 1}`,
                  language: "en-GB",
                  timeout: "5",
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
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a polite UK receptionist for Silver Birch Landscaping and Gardening. Be brief, clear, and warm. Always ask for the caller's name, phone number, and location for quotes. Never say you don't offer something; instead, say you'll pass the enquiry to the team."
        },
        { role: "user", content: transcript },
      ],
    });

    const reply =
      completion.choices[0].message?.content?.trim() ||
      "I'm sorry, could you repeat that?";

    console.log(`🤖 GPT Response: "${reply}"`);

    const twiml = xml(
      {
        Response: [
          buildSay(reply),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather?attempt=1",
                language: "en-GB",
                timeout: "5",
                speechTimeout: "auto",
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
    const twiml = xml(
      {
        Response: [
          buildSay("I'm sorry, there was a technical issue. One of the team will call you back shortly.")
        ],
      },
      { declaration: true }
    );
    res.type("text/xml").send(twiml);
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
