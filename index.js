import express from "express";
import xml from "xml";
import OpenAI from "openai";

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI();

const PORT = 10000;

// Initial answer message
const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";

// Friendly filler
const fillerPrompt = "One moment please...";

// Function to generate TwiML
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
    // If nothing heard, re-prompt
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

  // Immediately acknowledge while GPT is thinking
  const fillerTwiml = xml(
    {
      Response: [buildSay(fillerPrompt)],
    },
    { declaration: true }
  );

  res.type("text/xml").send(fillerTwiml);

  // Generate GPT response asynchronously
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

    // Build TwiML to reply and re-gather
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

    // Post response to Twilio (you can't respond again via HTTP)
    // Instead, use Twilio's REST API to send the response mid-call if needed.
    // Otherwise, the filler message is spoken, and user can re-prompt.
    // For simplicity here, you can consider logging the reply or extending the architecture later.
  } catch (err) {
    console.error("❌ GPT Error:", err);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
