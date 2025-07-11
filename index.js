const express = require("express");
const bodyParser = require("body-parser");
const { Configuration, OpenAIApi } = require("openai");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Configure OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Helper to generate GPT reply
async function generateReply(transcript) {
  const completion = await openai.createChatCompletion({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant answering phone calls for Noah's garden business.",
      },
      {
        role: "user",
        content: transcript,
      },
    ],
  });

  return completion.data.choices[0].message.content.trim();
}

// Route to handle incoming calls
app.post("/voice", (req, res) => {
  console.log("✅ Incoming call...");

  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    { voice: "Polly.Joanna" },
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

// Route to handle transcription and reply
app.post("/transcription", async (req, res) => {
  console.log("✅ Received transcription callback.");
  const transcript = req.body.TranscriptionText;
  console.log(`📝 Transcript: ${transcript}`);

  if (!transcript || transcript.trim() === "") {
    console.log("⚠️ Empty transcript.");
    return res.sendStatus(200);
  }

  const reply = await generateReply(transcript);
  console.log(`💬 GPT Reply: ${reply}`);

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({ voice: "Polly.Joanna" }, reply);

  res.type("text/xml");
  res.send(twiml.toString());
});

// Start the server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
