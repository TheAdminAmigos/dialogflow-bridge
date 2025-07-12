import express from "express";
import xml from "xml";
import OpenAI from "openai";
import pkg from "twilio";
const { Twilio } = pkg;

const app = express();
app.use(express.urlencoded({ extended: true }));
const openai = new OpenAI();
const client = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const PORT = 10000;
const MAX_NO_INPUTS = 3;
const activeCalls = new Map();

const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";
const fillerPrompt = "One moment please...";
const goodbyeMessage = "Thank you for calling. Have a lovely day!";

const buildSay = (text) => ({
  Say: {
    _attr: { voice: "Polly.Emma-Neural" },
    _cdata: text,
  },
});

const buildGather = (prompt) => ({
  Gather: {
    _attr: {
      input: "speech",
      action: "/gather",
      language: "en-GB",
      timeout: "10",
      speechTimeout: "auto",
    },
    Say: {
      _attr: { voice: "Polly.Emma-Neural" },
      _cdata: prompt,
    },
  },
});

// Answer incoming calls
app.post("/voice", (req, res) => {
  console.log("📞 Incoming call");
  activeCalls.set(req.body.CallSid, { noInputCount: 0 });

  const twiml = xml(
    { Response: [buildGather(initialGreeting)] },
    { declaration: true }
  );
  res.type("text/xml").send(twiml);
});

// Handle user speech
app.post("/gather", async (req, res) => {
  const callSid = req.body.CallSid;
  const transcript = req.body.SpeechResult?.trim();
  const callData = activeCalls.get(callSid) || { noInputCount: 0 };

  if (!transcript) {
    callData.noInputCount += 1;
    activeCalls.set(callSid, callData);

    if (callData.noInputCount >= MAX_NO_INPUTS) {
      console.log("👋 No input too many times, ending call.");
      const twiml = xml(
        { Response: [buildSay(goodbyeMessage)] },
        { declaration: true }
      );
      return res.type("text/xml").send(twiml);
    }

    console.log("🤷 No input detected, reprompting.");
    const twiml = xml(
      { Response: [buildGather("Sorry, I didn’t catch that. Could you please repeat?")] },
      { declaration: true }
    );
    return res.type("text/xml").send(twiml);
  }

  console.log(`🗣️ User said: "${transcript}"`);

  // Play filler prompt + Gather to keep call alive
  const twiml = xml(
    { Response: [buildGather(fillerPrompt)] },
    { declaration: true }
  );
  res.type("text/xml").send(twiml);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a polite UK receptionist for Silver Birch Landscaping and Gardening. If the question is about a service you don’t offer, ask for the caller’s contact details so the team can follow up. Keep replies under 2 sentences.",
        },
        { role: "user", content: transcript },
      ],
    });

    let reply =
      completion.choices[0].message?.content?.trim() ||
      "I'm sorry, could you please repeat that?";

    console.log(`🤖 GPT Response: "${reply}"`);

    // Post TwiML to the active call
    await client.calls(callSid).update({
      twiml: xml(
        { Response: [buildGather(reply)] },
        { declaration: true }
      ),
    });
  } catch (err) {
    console.error("❌ GPT or Twilio Update Error:", err);

    try {
      await client.calls(callSid).update({
        twiml: xml(
          {
            Response: [
              buildSay("I'm sorry, something went wrong. Please call again later."),
            ],
          },
          { declaration: true }
        ),
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
