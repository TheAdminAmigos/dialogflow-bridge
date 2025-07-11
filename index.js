// index.js

import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import express from 'express';
import { xml } from 'xml';

// Create Express app
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const port = process.env.PORT || 10000;

// WebSocket setup
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('✅ WebSocket connected');

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.event === 'start') {
      console.log('🔹 Start event received');
    }
    if (msg.event === 'media') {
      console.log(`🎙️ Media event – Payload length: ${msg.media.payload.length}`);
    }
    if (msg.event === 'stop') {
      console.log('🔴 Stop event received');
    }
  });

  ws.on('close', () => {
    console.log('❎ WebSocket disconnected');
  });
});

// Twilio webhook route
app.post('/voice', (req, res) => {
  console.log('📞 Twilio Voice webhook received');
  const responseXml = `
    <Response>
      <Say voice="alice">Hello, this is your test bot speaking. Your call has been received successfully.</Say>
    </Response>
  `;
  res.type('text/xml');
  res.send(responseXml);
});

// Start server
server.listen(port, () => {
  console.log(`🌐 WebSocket + Express server listening on port ${port}`);
});
