import express from "express";
import xml from "xml";
import OpenAI from "openai";
import pkg from "twilio";
const { Twilio } = pkg;

const app = express();
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI();
const client = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const PORT = 10000;
const initialGreeting = "Hello, Silver Birch Landscaping and Gardening. How can I help you?";
const fillerPrompt = "One moment please...";
const goodbyePrompt = "Thank you so much for calling. Have a wonderful day!";

const buildSay = (text) => ({
  Say: {
    _attr: { voice: "Polly.Emma-Neural" },
    _cdata: text,
  },
});

// Initial answer
app.post("/voice", (req, res) => {
  console.log("📞 Incoming call - sending initial greeting immediately.");

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
              timeout: "5",
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

// Handle Gather
app.post("/gather", async (req, res) => {
  const transcript = req.body.SpeechResult || "";
  const callSid = req.body.CallSid;

  console.log(`🗣️ User said: "${transcript}"`);

  if (!transcript) {
    const twiml = xml(
      {
        Response: [
          buildSay("Sorry, I didn't catch that. Could you please repeat?"),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather",
                language: "en-GB",
                timeout: "5",
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

  // Send filler response while GPT is thinking
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
          content:
            "You are a polite UK receptionist for Silver Birch Landscaping and Gardening. Answer briefly and helpfully. If asked about something you don’t offer, ask for contact details to pass along.",
        },
        { role: "user", content: transcript },
      ],
    });

    const reply = completion.choices[0].message?.content?.trim() || goodbyePrompt;
    console.log(`🤖 GPT Response: "${reply}"`);

    const responseTwiml = xml(
      {
        Response: [
          buildSay(reply),
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/gather",
                language: "en-GB",
                timeout: "5",
                speechTimeout: "auto",
              },
            },
          },
        ],
      },
      { declaration: true }
    );

    // Try to inject response
    try {
      await client.calls(callSid).update({ twiml: responseTwiml });
      console.log("✅ Injected follow-up TwiML successfully.");
    } catch (error) {
      console.error("❌ Injection Error:", error);

      if (error.code === 21220) {
        console.log("🔄 Retrying injection after 0.5s...");
        setTimeout(async () => {
          try {
            await client.calls(callSid).update({ twiml: responseTwiml });
            console.log("✅ Retry succeeded.");
          } catch (retryError) {
            console.error("❌ Retry injection failed:", retryError);
          }
        }, 500);
      }
    }
  } catch (err) {
    console.error("❌ GPT Processing Error:", err);

    const fallbackTwiml = xml(
      { Response: [buildSay("I'm sorry, something went wrong. Please call back later.")] },
      { declaration: true }
    );

    try {
      await client.calls(callSid).update({ twiml: fallbackTwiml });
    } catch (fallbackError) {
      console.error("❌ Fallback injection failed:", fallbackError);
    }
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
