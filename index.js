import express from "express";
import xml from "xml";
import OpenAI from "openai";
import twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const PORT = 10000;

// Initial answer message
const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";

// Friendly filler
const fillerPrompt = "One moment please...";

// Goodbye messages
const goodbyeQuote = "Thank you! One of the team will be in touch shortly to arrange your quote. Have a lovely day.";
const goodbyeGeneric = "Thank you! One of the team will be in touch shortly. Have a lovely day.";

// Helper to build <Say>
const buildSay = (text) => ({
  Say: {
    _attr: { voice: "Polly.Emma-Neural" },
    _cdata: text,
  },
});

// 🎯 Endpoint: Answer the call
app.post("/voice", (req, res) => {
  console.log("📞 Incoming call");

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

  res.type("text/xml").send(twiml);
});

// 🎯 Endpoint: Handle Gathered Speech
app.post("/gather", async (req, res) => {
  const transcriptRaw = req.body.SpeechResult || "";
  const transcript = transcriptRaw.toLowerCase();
  const callSid = req.body.CallSid;

  console.log(`🗣️ User said: "${transcriptRaw}"`);

  if (!transcriptRaw) {
    const twiml = xml(
      {
        Response: [
          buildSay("Sorry, I didn't hear anything. Could you please repeat that?"),
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

  // Immediately acknowledge
  const fillerTwiml = xml(
    { Response: [buildSay(fillerPrompt)] },
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
          content: "You are a polite UK receptionist for Silver Birch Landscaping and Gardening. Answer briefly and helpfully.",
        },
        { role: "user", content: transcriptRaw },
      ],
    });

    const gptReply = completion.choices[0].message?.content?.trim() || "I'm sorry, I didn't quite catch that.";
    console.log(`🤖 GPT Response: "${gptReply}"`);

    // Decide whether to say goodbye or re-prompt
    let finalText;
    if (transcript.includes("quote") || transcript.includes("price")) {
      finalText = goodbyeQuote;
    } else if (
      transcript.includes("phone number") ||
      transcript.includes("address") ||
      transcript.includes("contact details")
    ) {
      finalText = goodbyeGeneric;
    } else {
      finalText = gptReply;
    }

    // Build TwiML to say final text (or re-prompt if not goodbye)
    const isGoodbye = finalText === goodbyeQuote || finalText === goodbyeGeneric;

    const responseTwiml = xml(
      {
        Response: isGoodbye
          ? [buildSay(finalText)]
          : [
              buildSay(finalText),
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

    // Inject TwiML mid-call
    await client.calls(callSid).update({ twiml: responseTwiml });
  } catch (err) {
    console.error("❌ GPT or Twilio Update Error:", err);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
