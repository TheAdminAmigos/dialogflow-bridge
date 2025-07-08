// index.js
const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");

// Load Google Cloud client library
const speech = require("@google-cloud/speech");

// Parse the credentials JSON from the environment variable
const googleCredentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);

// Create the Speech-to-Text client
const client = new speech.SpeechClient({
  credentials: {
    client_email: googleCredentials.client_email,
    private_key: googleCredentials.private_key
  },
  projectId: googleCredentials.project_id
});

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Serve TwiML instructions to Twilio when a call starts
app.post("/", (req, res) => {
  console.log("✅ Received Twilio HTTP POST");

  res.type("text/xml");
  res.send(`
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media"/>
      </Start>
      <Say voice="alice">Hi Martyn, I'm listening!</Say>
      <Pause length="600"/>
    </Response>
  `);
});

// Create WebSocket server
const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connection established");

  // Create a streaming recognize request
  const recognizeStream = client
    .streamingRecognize({
      config: {
        encoding: "MULAW",
        sampleRateHertz: 8000,
        languageCode: "en-GB"
      },
      interimResults: true
    })
    .on("error", (err) => {
      console.error("❌ Speech r
