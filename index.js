// index.js
require("dotenv").config();
const express = require("express");
const { OpenAI } = require("openai");
const twilio = require("twilio");

// Twilio credentials
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Health check route
app.get("/", (req, res) => {
  res.send("✅ Dialogflow Bridge is live!");
});

// This endpoint responds to the initial call
app.post("/voice", (req, res) => {
  console.log("✅ Incoming call...");

  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    {
      voice: "Polly.Joanna",
    },
    "Hello! This is your virtual assistant. After the beep, please say your message, and I will reply."
  );

  twiml.record({
    transcribe: true,
    transcribeCallback: "/transcription",
    maxLength: 15,
    playBeep: true,
    trim: "trim-silence",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// This endpoint receives the transcription and responds
app.post("/transcription", async (req, res) => {
  console.log("✅ Received transcription callback.");

  const transcript = req.body.TranscriptionText || "";
  console.log(`📝 Transcript: ${transcript}`);

  if (!transcript) {
    console.log("⚠️ Empty transcript.");
    const emptyTwiml = new twilio.twiml.VoiceResponse();
    emptyTwiml.say("I'm sorry, I didn't hear anything. Goodbye.");
    emptyTwiml.hangup();
    res.type("text/xml");
    return res.send(emptyTwiml.toString());
  }

  // Generate GPT reply
  let reply = "I'm sorry, I couldn't understand your request.";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a friendly receptionist for Silver Birch Landscaping. Answer questions concisely.",
        },
        {
          role: "user",
          content: transcript,
        },
      ],
    });

    reply = completion.choices[0].message.content.trim();
    console.log(`💬 GPT Reply: ${reply}`);
  } catch (err) {
    console.error("❌ GPT Error:", err);
  }

  // Send TwiML response with GPT reply
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(
    {
      voice: "Polly.Joanna",
    },
    reply
  );
  twiml.hangup();

  res.type("text/xml");
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
