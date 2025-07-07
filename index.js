require("dotenv").config();
const fs = require("fs");
const WebSocket = require("ws");
const uuid = require("uuid");
const dialogflow = require("@google-cloud/dialogflow");

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

console.log("WebSocket server started on port", process.env.PORT || 8080);

wss.on("connection", function connection(ws) {
  console.log("Client connected");

  const sessionId = uuid.v4();
  const sessionClient = new dialogflow.SessionsClient({
    keyFilename: "credentials.json",
  });
  const sessionPath = sessionClient.projectAgentSessionPath(
    process.env.PROJECT_ID,
    sessionId,
  );

  const detectStream = sessionClient
    .streamingDetectIntent()
    .on("error", console.error)
    .on("data", (data) => {
      if (data.recognitionResult) {
        console.log(
          `Intermediate transcript: ${data.recognitionResult.transcript}`,
        );
      } else if (data.queryResult) {
        console.log(`Detected intent: ${data.queryResult.intent.displayName}`);
        ws.send(JSON.stringify({ text: data.queryResult.fulfillmentText }));
      }
    });

  ws.on("message", function incoming(message) {
    // When Twilio sends audio, it arrives as binary
    detectStream.write({
      inputAudio: message,
      queryInput: {
        audioConfig: {
          audioEncoding: "AUDIO_ENCODING_LINEAR_16",
          sampleRateHertz: 8000,
          languageCode: process.env.LANGUAGE_CODE,
        },
      },
      singleUtterance: true,
    });
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    detectStream.end();
  });
});
