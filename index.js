import express from "express";
import xml from "xml";
import OpenAI from "openai";

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI();

const PORT = 10000;

// Initial greeting
const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";

// Filler phrase while GPT thinks
const fillerPrompt = "One moment please...";

// Helper to build <Say>
const buildSay = (text) => ({
  Say: {
    _attr: { voice: "Polly.Emma-Neural" },
    _cdata: text,
  },
});

// 🎯 Route: Answer the call
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
              action: "/respond",
              method: "POST",
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

// 🎯 Route: Handle Gathered Speech
app.all("/respond", async (req, res) => {
  const transcript = req.body.SpeechResult || "";
  console.log(`🗣️ User said: "${transcript}"`);

  if (!transcript) {
    // If nothing heard, re-prompt
    const twiml = xml(
      {
        Response: [
          buildSay("Sorry, I didn't hear anything. Could you please repeat that?"),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/respond",
                method: "POST",
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
    return res.type("text/xml").send(twiml);
  }

  // Acknowledge while GPT thinks
  const fillerTwiml = xml(
    {
      Response: [buildSay(fillerPrompt)],
    },
    { declaration: true }
  );

  res.type("text/xml").send(fillerTwiml);

  // Generate GPT reply asynchronously (note: cannot respond again via HTTP here)
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

    // *** NOTE ***
    // For simplicity, this code just logs the reply.
    // To speak it mid-call, you will upgrade to TwiML injection (Twilio REST API).
    // The caller will be prompted to say something again after the filler.
  } catch (err) {
    console.error("❌ GPT Error:", err);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
