import express from "express";
import xml from "xml";
import OpenAI from "openai";
import Twilio from "twilio";

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI();
const twilioClient = Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const PORT = 10000;

const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";
const fillerPrompt = "One moment please...";
const fallbackPrompt = "Sorry for the wait—modern technology is great until you're trying to be quick, lol!";

const buildSay = (text) => ({
  Say: {
    _attr: { voice: "Polly.Emma-Neural" },
    _cdata: text,
  },
});

// 🎯 Endpoint: Answer the call
app.post("/voice", (req, res) => {
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
  const transcript = req.body.SpeechResult || "";
  const callSid = req.body.CallSid;

  console.log(`🗣️ User said: "${transcript}"`);

  if (!transcript) {
    // Nothing heard—re-prompt
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

  // Respond immediately with filler so the call doesn't time out
  const fillerTwiml = xml(
    {
      Response: [buildSay(fillerPrompt)],
    },
    { declaration: true }
  );

  res.type("text/xml").send(fillerTwiml);

  try {
    // Generate GPT reply
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

    const reply =
      completion.choices[0].message?.content?.trim() ||
      "I'm sorry, I didn't quite catch that.";

    console.log(`🤖 GPT Response: "${reply}"`);

    // Inject the reply mid-call using Twilio REST API
    await twilioClient.calls(callSid).update({
      twiml: xml(
        {
          Response: [
            buildSay(reply),
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
      ),
    });

    console.log("✅ TwiML injected successfully.");
  } catch (err) {
    console.error("❌ GPT or Twilio Update Error:", err);

    // Fallback: inject friendly re-gather prompt
    try {
      await twilioClient.calls(callSid).update({
        twiml: xml(
          {
            Response: [
              buildSay(fallbackPrompt),
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
        ),
      });
      console.log("✅ Fallback TwiML injected successfully.");
    } catch (fallbackErr) {
      console.error("❌ Fallback Injection Error:", fallbackErr);
    }
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
