import express from "express";
import xml from "xml";
import OpenAI from "openai";

const app = express();
const openai = new OpenAI();

app.use(express.urlencoded({ extended: true }));

// Store the last conversation per call
const sessions = {};

app.post("/voice", async (req, res) => {
  const callSid = req.body.CallSid;
  const userSpeech = req.body.SpeechResult?.trim();
  console.log(`📞 Incoming call: ${callSid}`);
  console.log(`🗣️ User said: "${userSpeech}"`);

  // Initialise session if new
  if (!sessions[callSid]) {
    sessions[callSid] = [];
  }

  let twimlResponse = "";

  if (!userSpeech) {
    // First call answer
    twimlResponse = xml(
      {
        Response: [
          {
            Say: {
              _attr: { voice: "Polly.Emma-Neural" },
              _cdata: "Hello, Silver Birch Landscaping and Gardening. How can I help you today?",
            },
          },
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/voice",
                timeout: "3",
              },
              Say: {
                _attr: { voice: "Polly.Emma-Neural" },
                _cdata: "(You can speak after the beep.)",
              },
            },
          },
        ],
      },
      { declaration: true }
    );
  } else {
    // Save user input to session
    sessions[callSid].push({ role: "user", content: userSpeech });

    // Pre-filler response
    twimlResponse = xml(
      {
        Response: [
          {
            Say: {
              _attr: { voice: "Polly.Emma-Neural" },
              _cdata: "One moment please...",
            },
          },
        ],
      },
      { declaration: true }
    );

    // Send pre-filler response while GPT processes
    res.type("text/xml").send(twimlResponse);

    // Generate GPT reply
    let gptResponseText = "";
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a polite receptionist for a landscaping and gardening company in the UK. Keep answers under 2 sentences. Always finish by asking if there's anything else the caller needs.",
          },
          ...sessions[callSid],
        ],
      });
      gptResponseText =
        completion.choices[0].message?.content?.trim() ||
        "I'm sorry, could you please repeat that?";
      console.log(`🤖 GPT Response: "${gptResponseText}"`);

      // Save assistant reply
      sessions[callSid].push({ role: "assistant", content: gptResponseText });
    } catch (error) {
      console.error("❌ GPT Error:", error);
      gptResponseText =
        "I'm sorry, something went wrong. Could you please repeat that?";
    }

    // Build TwiML for GPT reply + next Gather
    const finalTwiml = xml(
      {
        Response: [
          {
            Say: {
              _attr: { voice: "Polly.Emma-Neural" },
              _cdata: gptResponseText,
            },
          },
          {
            Gather: {
              _attr: {
                input: "speech",
                action: "/voice",
                timeout: "3",
              },
              Say: {
                _attr: { voice: "Polly.Emma-Neural" },
                _cdata: "Is there anything else I can help you with?",
              },
            },
          },
        ],
      },
      { declaration: true }
    );

    // Respond with GPT reply and re-prompt
    res.type("text/xml").send(finalTwiml);
    return;
  }

  res.type("text/xml").send(twimlResponse);
});

// Start server
app.listen(10000, () => {
  console.log("🌐 Server listening on port 10000");
});
