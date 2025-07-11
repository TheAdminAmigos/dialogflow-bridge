import express from "express";
import dotenv from "dotenv";
import { OpenAI } from "openai";
import { Twilio } from "twilio";
import fs from "fs";

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const twilio = new Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

app.post("/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    { voice: "Polly.Joanna" },
    "Hello! This is your virtual assistant. After the beep, please say your message and I will reply."
  );

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
  console.log("✅ Received transcription callback.");
  const transcript = req.body.TranscriptionText || "";
  console.log(`📝 Transcript: ${transcript}`);

  if (!transcript) {
    // If transcript empty, prompt to repeat
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(
      { voice: "Polly.Joanna" },
      "I'm sorry, I didn't hear anything. Could you please repeat that?"
    );
    twiml.record({
      transcribe: true,
      transcribeCallback: "/transcription",
      maxLength: 10,
      playBeep: true,
      trim: "trim-silence",
    });
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  // Generate response with GPT
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a friendly virtual assistant helping callers.",
      },
      { role: "user", content: transcript },
    ],
  });

  const gptReply = completion.choices[0].message.content.trim();
  console.log(`💬 GPT Reply: ${gptReply}`);

  // Respond with TTS and prompt for next input
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({ voice: "Polly.Joanna" }, gptReply);

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

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`🌐 Server listening on port ${port}`);
});
