import express from "express";
import xml from "xml";
import OpenAI from "openai";
import pkg from "twilio";
const { Twilio } = pkg;

const app = express();
app.use(express.urlencoded({ extended: true }));
const PORT = 10000;

const openai = new OpenAI();
const twilioClient = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you today?";
const holdingPrompt = "Okay, one moment please while I find that information for you.";
const fallbackGoodbye = "Thank you for calling Silver Birch Landscaping and Gardening. We will be in touch soon. Goodbye!";

const buildSay = (text) => ({
  Say: {
    _attr: { voice: "Polly.Emma-Neural" },
    _cdata: text,
  },
});

// 🎯 Answer call
app.post("/voice", (req, res) => {
  console.log("📞 Incoming call - sending initial greeting immediately.");

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
              timeout: "10",
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

// 🎯 Handle Gathered Speech
app.post("/gather", async (req, res) => {
  const callSid = req.body.CallSid;
  const transcript = req.body.SpeechResult || "";

  console.log(`🗣️ User said: "${transcript}"`);

  if (!transcript) {
    console.log("⚠️ No transcript received—ending politely.");
    const twiml = xml(
      {
        Response: [buildSay(fallbackGoodbye)],
      },
      { declaration: true }
    );
    return res.type("text/xml").send(twiml);
  }

  // Immediately respond with holding prompt
  const fillerTwiml = xml(
    {
      Response: [buildSay(holdingPrompt)],
    },
    { declaration: true }
  );
  res.type("text/xml").send(fillerTwiml);

  try {
    // Generate GPT reply
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a polite UK receptionist for Silver Birch Landscaping and Gardening. Answer helpfully and briefly. If asked about services not offered, say you can take their details so a team member can follow up.",
        },
        { role: "user", content: transcript },
      ],
    });

    let reply =
      completion.choices[0].message?.content?.trim() ||
      "I'm sorry, I didn't quite catch that. Could you repeat it please?";

    // If GPT says we don't offer something, change reply
    if (
      reply.toLowerCase().includes("we don’t offer") ||
      reply.toLowerCase().includes("we don't offer")
    ) {
      reply =
        "I’m sorry, I'm not sure whether that is something we normally offer, but I’d love to get one of the team to contact you. What's your name and phone number please?";
    }

    console.log(`🤖 GPT Response: "${reply}"`);

    // Build TwiML to speak reply and re-gather
    const followupTwiml = xml(
      {
        Response: [
          buildSay(reply),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather",
                language: "en-GB",
                timeout: "10",
                speechTimeout: "auto",
              },
            },
          },
        ],
      },
      { declaration: true }
    );

    // Try to inject
    await twilioClient.calls(callSid).update({
      twiml: followupTwiml,
    });
    console.log("✅ Injected follow-up TwiML successfully.");
  } catch (err) {
    console.error("❌ GPT or Twilio Update Error:", err);

    // Retry once after 0.5s
    setTimeout(async () => {
      try {
        await twilioClient.calls(callSid).update({
          twiml: xml(
            {
              Response: [
                buildSay(
                  "Sorry, something went wrong. Could you please repeat that?"
                ),
                {
                  Gather: {
                    _attr: {
                      input: "speech",
                      action: "/gather",
                      language: "en-GB",
                      timeout: "10",
                      speechTimeout: "auto",
                    },
                  },
                },
              ],
            },
            { declaration: true }
          ),
        });
        console.log("✅ Retry injection succeeded.");
      } catch (retryErr) {
        console.error("❌ Retry injection failed:", retryErr);
      }
    }, 500);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
