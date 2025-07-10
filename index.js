// index.js
require("dotenv").config();
const fs = require("fs");
const express = require("express");
const { OpenAI } = require("openai");
const { Readable } = require("stream");
const twilio = require("twilio");
const { SpeechClient } = require("@google-cloud/speech");

// Twilio credentials from environment
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(twilioAccountSid, twilioAuthToken);

// Google Cloud Speech client
const speechClient = new SpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.send("OK");
});

app.post("/", async (req, res) => {
  console.log("✅ Received Twilio HTTP POST");

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say("Hello! Please speak after the beep. Then wait a moment for my response.");

  // Create a <Gather> verb to record speech
  twiml.record({
    transcribe: true,
    transcribeCallback: "/transcription",
    maxLength: 10,
    playBeep: true,
    trim: "trim-silence",
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

app.post("/transcription", async (req, res) => {
  console.log("✅ Received transcription callback");

  const transcript = req.body.TranscriptionText || "";
  console.log(`📝 Transcription: ${transcript}`);

  // Call OpenAI to get reply
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a friendly phone assistant for Silver Birch Landscaping. Reply concisely and warmly."
      },
      { role: "user", content: transcript }
    ],
  });

  const gptReply = completion.choices[0].message.content.trim();
  console.log(`💬 GPT Reply: ${gptReply}`);

  // Respond to Twilio with <Say>
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say(gptReply);
  twiml.hangup();

  res.type("text/xml");
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});
