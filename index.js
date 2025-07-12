import express from "express";
import { v4 as uuidv4 } from "uuid";
import xml from "xml";
import OpenAI from "openai";

const app = express();
const openai = new OpenAI();

app.use(express.urlencoded({ extended: true }));

// Twilio voice webhook
app.post("/voice", async (req, res) => {
  const userSpeech = req.body.SpeechResult;
  const attempt = parseInt(req.body.CurrentAttempt || "1", 10);

  // If no speech yet (first call), greet and start Gather
  if (!userSpeech) {
    const twiml = xml(
      {
        Response: [
          {
            Say: {
              _attr: { voice: "Polly.Amy-Neural" },
              _cdata: "Hello, Silver Birch Landscaping and Gardening. How can I help you today?",
            },
          },
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/voice",
                method: "POST",
                timeout: "5",
                speechTimeout: "auto",
              },
              Say: {
                _attr: { voice: "Polly.Amy-Neural" },
                _cdata: "Please tell me what you'd like help with.",
              },
            },
          },
        ],
      },
      { declaration: true }
    );

    return res.type("text/xml").send(twiml);
  }

  // Acknowledge the user's input
  console.log(`💬 User said: ${userSpeech}`);

  // Call OpenAI for a reply
  let gptResponse = "I'm sorry, I didn't catch that. Could you please repeat?";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a polite receptionist for a landscaping and gardening business in the UK. Keep responses short (max 2 sentences) and warm. Reconfirm what the customer said if possible.",
        },
        { role: "user", content: userSpeech },
      ],
    });

    gptResponse =
      completion.choices[0].message?.content?.trim() ||
      gptResponse;
  } catch (err) {
    console.error("❌ GPT Error:", err);
  }

  console.log(`🤖 GPT Reply: ${gptResponse}`);

  // If user has tried 2 times without input, end call politely
  if (attempt >= 2 && (!userSpeech || userSpeech.trim() === "")) {
    const twiml = xml(
      {
        Response: [
          {
            Say: {
              _attr: { voice: "Polly.Amy-Neural" },
              _cdata: "It seems we're having trouble hearing you. Thank you for calling. Goodbye.",
            },
          },
          { Hangup: {} },
        ],
      },
      { declaration: true }
    );
    return res.type("text/xml").send(twiml);
  }

  // Speak GPT reply and gather again
  const twiml = xml(
    {
      Response: [
        {
          Pause: { _attr: { length: "1" } },
        },
        {
          Say: {
            _attr: { voice: "Polly.Amy-Neural" },
            _cdata: gptResponse,
          },
        },
        {
          Gather: {
            _attr: {
              input: "speech",
              action: "/voice",
              method: "POST",
              timeout: "5",
              speechTimeout: "auto",
            },
            Say: {
              _attr: { voice: "Polly.Amy-Neural" },
              _cdata: "Is there anything else I can help you with?",
            },
          },
        },
      ],
    },
    { declaration: true }
  );

  res.type("text/xml").send(twiml);
});

// Start the Express server
app.listen(10000, () => {
  console.log("🌐 Server listening on port 10000");
});
