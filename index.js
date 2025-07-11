import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';

const port = process.env.PORT || 10000;

const server = http.createServer();
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

server.listen(port, () => {
  console.log(`🌐 WebSocket server listening on port ${port}`);
});
