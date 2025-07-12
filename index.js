import express from "express";
import xml from "xml";
import OpenAI from "openai";
import { Twilio } from "twilio";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));
const openai = new OpenAI();
const twilio = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const PORT = 10000;

const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";
const fillerPrompt = "One moment please...";

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
      timeout: "3",
      speechTimeout: "auto",
    },
    _cdata: prompt || "",
  },
});

app.post("/voice", (req, res) => {
  console.log("📞 Incoming call");

  const twiml = xml(
    {
      Response: [
        buildSay(initialGreeting),
        buildGather(""),
      ],
    },
    { declaration: true }
  );

  res.type("text/xml").send(twiml);
});

app.post("/gather", async (req, res) => {
  const transcript = req.body.SpeechResult || "";
  const callSid = req.body.CallSid;
  console.log(`🗣️ User said: "${transcript}"`);

  if (!transcript) {
    const twiml = xml(
      {
        Response: [
          buildSay("Sorry, I didn't hear anything. Could you please repeat that?"),
          buildGather(""),
        ],
      },
      { declaration: true }
    );
    return res.type("text/xml").send(twiml);
  }

  // Immediately acknowledge while GPT processes
  const fillerTwiml = xml(
    {
      Response: [
        buildSay(fillerPrompt),
        buildGather(""),
      ],
    },
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
            "You are a polite UK receptionist for Silver Birch Landscaping and Gardening. Answer briefly and helpfully.",
        },
        { role: "user", content: transcript },
      ],
    });

    let reply =
      completion.choices[0].message?.content?.trim() ||
      "I'm sorry, I didn't quite catch that.";

    console.log(`🤖 GPT Response: "${reply}"`);

    // Check if GPT response mentions no service
    if (reply.toLowerCase().includes("we don’t offer") || reply.toLowerCase().includes("we don't offer") || reply.toLowerCase().includes("unfortunately we don’t") || reply.toLowerCase().includes("unfortunately we don't")) {
      reply =
        "I’m sorry, I'm not sure whether that is something we normally offer, but I’d love to get one of the team to get in touch and let you know. What's your name and phone number please?";
    }

    const responseTwiml = xml(
      {
        Response: [
          buildSay(reply),
          buildGather(""),
        ],
      },
      { declaration: true }
    );

    // Inject TwiML mid-call
    await twilio.calls(callSid).update({ twiml: responseTwiml });

  } catch (err) {
    console.error("❌ GPT or Twilio Update Error:", err);
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
