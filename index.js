import express from "express";
import xml from "xml";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI();
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const PORT = 10000;

// Initial greeting
const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";

// Filler while GPT responds
const fillerPrompt = "One moment please...";

// Fallback goodbye
const goodbyePrompt = "Thank you, one of the team will be in touch shortly. Have a lovely day!";

// Build TwiML <Say>
const buildSay = (text) => ({
  Say: {
    _attr: { voice: "Polly.Emma-Neural" },
    _cdata: text,
  },
});

// POST /voice – answer call
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

// POST /gather – handle user speech
app.post("/gather", async (req, res) => {
  const transcript = req.body.SpeechResult || "";
  const callSid = req.body.CallSid;
  console.log(`🗣️ User said: "${transcript}"`);

  if (!transcript) {
    // If nothing heard, re-gather
    const twiml = xml(
      {
        Response: [
          buildSay("Sorry, I didn't catch that. Could you please repeat?"),
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

  // Respond immediately with filler so Twilio doesn't time out
  const fillerTwiml = xml(
    { Response: [buildSay(fillerPrompt)] },
    { declaration: true }
  );
  res.type("text/xml").send(fillerTwiml);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a polite UK receptionist for Silver Birch Landscaping and Gardening. If the user asks about services not offered, suggest taking their contact details so the team can follow up.",
        },
        { role: "user", content: transcript },
      ],
    });

    let reply =
      completion.choices[0].message?.content?.trim() ||
      "I'm sorry, could you please repeat that?";

    console.log(`🤖 GPT Response: "${reply}"`);

    // If GPT says we don't offer this, override with lead capture message
    if (
      reply.includes("don't offer") ||
      reply.includes("do not offer") ||
      reply.includes("unfortunately we don't") ||
      reply.includes("unfortunately, we don't")
    ) {
      reply =
        "I’m sorry, I'm not sure whether that is something we normally offer, but I’d love to get one of the team to contact you. What's your name and phone number please?";
    }

    // Inject TwiML mid-call
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
                timeout: "2",
                speechTimeout: "auto",
              },
            },
          },
        ],
      },
      { declaration: true }
    );

    await client.calls(callSid).update({
      twiml,
    });
  } catch (err) {
    console.error("❌ GPT or Twilio Update Error:", err);

    // Fallback: end politely
    const fallbackTwiml = xml(
      { Response: [buildSay(goodbyePrompt)] },
      { declaration: true }
    );

    try {
      await client.calls(callSid).update({
        twiml: fallbackTwiml,
      });
    } catch (fallbackErr) {
      console.error("❌ Fallback Injection Error:", fallbackErr);
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
