/**
 * Noah's Semi Real-Time Bot - Node.js
 * Version: Semi-Real-Time Basic
 */

require("dotenv").config();
const express = require("express");
const { OpenAI } = require("openai");
const { SpeechClient } = require("@google-cloud/speech");
const twilio = require("twilio");
const fs = require("fs");

// Initialise Express
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialise Clients
const openai = new OpenAI();
const speechClient = new SpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
});

// Serve root
app.get("/", (req, res) => {
  res.send("👋 Noah's Bot is running!");
});

// Webhook endpoint for incoming calls
app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    { voice: "Polly.Joanna" },
    "Hello! This is your virtual assistant. Please speak after the beep, and I will respond shortly."
  );

  twiml.record({
    transcribe: true,
    transcribeCallback: "/transcription",
    maxLength: 15,
    playBeep: true,
    trim: "trim-silence"
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// Handle the transcription callback
app.post("/transcription", async (req, res) => {
  const transcript = req.body.TranscriptionText || "";
  console.log("📝 Transcription Received:", transcript);

  let gptResponse = "I'm sorry, I didn't catch that. Could you please repeat?";
  if (transcript.trim().length > 0) {
    // Send to GPT
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant for a landscaping business. Answer questions politely and clearly."
        },
        {
          role: "user",
          content: transcript
        }
      ]
    });

    gptResponse = completion.choices[0].message.content.trim();
  }

  console.log("💬 GPT Response:", gptResponse);

  // Respond with TwiML to speak back
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({ voice: "Polly.Joanna" }, gptResponse);

  res.type("text/xml");
  res.send(twiml.toString());
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
