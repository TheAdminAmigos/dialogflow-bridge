import express from "express";
import xml from "xml";
import OpenAI from "openai";
import pkg from "twilio";

const { Twilio } = pkg;
const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI();

const twilioClient = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const PORT = 10000;

const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";
const fillerPrompt = "One moment please...";
const goodbyeMessage = "Thank you! One of our team will be in touch shortly. Have a lovely day.";

const buildSay = (text) => ({
  Say: {
    _attr: { voice: "Polly.Emma-Neural" },
    _cdata: text,
  },
});

// 🎯 Answer the call
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
              timeout: "2",
              speechTimeout: "auto",
            },
          },
        },
      ],
    },
    { declaration: true }
  );

  res
    .type("text/xml")
    .set("Connection", "keep-alive")
    .send(twiml);
});

// 🎯 Handle Gathered Speech
app.post("/gather", async (req, res) => {
  const transcript = req.body.SpeechResult?.trim() || "";
  console.log(`🗣️ User said: "${transcript}"`);

  if (!transcript) {
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

  // Immediately reply with filler
  const fillerTwiml = xml(
    { Response: [buildSay(fillerPrompt)] },
    { declaration: true }
  );
  res.type("text/xml").send(fillerTwiml);

  // Process GPT asynchronously
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful UK receptionist for Silver Birch Landscaping and Gardening. Answer politely, briefly, and if the user asks about a service you don't offer, ask for their contact details so the team can follow up.",
        },
        { role: "user", content: transcript },
      ],
    });

    const reply = completion.choices[0].message?.content?.trim() || goodbyeMessage;
    console.log(`🤖 GPT Response: "${reply}"`);

    // Build follow-up TwiML
    const twimlResponse = xml(
      {
        Response: [
          buildSay(reply),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather",
                language: "en-GB",
                timeout: "6",
                speechTimeout: "auto",
              },
            },
          },
        ],
      },
      { declaration: true }
    );

    // Try to inject TwiML mid-call
    const callSid = req.body.CallSid;
    try {
      await twilioClient.calls(callSid).update({
        twiml: twimlResponse,
      });
      console.log("✅ Injected follow-up TwiML successfully.");
    } catch (err) {
      console.error("❌ Injection Error:", err);

      // Fallback: End call with goodbye
      await twilioClient.calls(callSid).update({
        twiml: xml(
          { Response: [buildSay(goodbyeMessage)] },
          { declaration: true }
        ),
      });
    }
  } catch (err) {
    console.error("❌ GPT Processing Error:", err);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
