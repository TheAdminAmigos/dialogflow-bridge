// index.js (CommonJS version)

const express = require("express");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const { GoogleAuth } = require("google-auth-library");
const Twilio = require("twilio");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const port = process.env.PORT || 10000;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Twilio client for call control
const twilioClient = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Google STT auth
const googleAuth = new GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

// Health check route
app.get("/", (req, res) => {
  res.send("✅ Dialogflow Bridge is live!");
});

// Voice webhook
app.post("/voice", (req, res) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.say(
    {
      voice: "Polly.Joanna",
    },
    "Hello! This is your virtual assistant. After the beep, please say your message, and I will reply."
  );

  twiml.record({
    transcribe: true,
    transcribeCallback: "/transcription",
    maxLength: 30,
    playBeep: true,
    trim: "trim-silence",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// Transcription handler
app.post("/transcription", async (req, res) => {
  console.log("✅ Received transcription callback.");
  const transcript = req.body.TranscriptionText;
  console.log(`📝 Transcript: ${transcript}`);

  if (!transcript || transcript.trim() === "") {
    console.log("⚠️ Empty transcript.");
    return res.sendStatus(200);
  }

  // Generate GPT reply
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a helpful business assistant answering customer questions.",
      },
      { role: "user", content: transcript },
    ],
  });

  const reply = completion.choices[0].message.content.trim();
  console.log(`💬 GPT Reply: ${reply}`);

  // Create new TwiML to respond
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.say(
    {
      voice: "Polly.Joanna",
    },
    reply
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

// Start server
app.listen(port, () => {
  console.log(`🌐 Server listening on port ${port}`);
});
