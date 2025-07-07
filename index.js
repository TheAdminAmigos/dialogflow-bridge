const WebSocket = require('ws');

// Start WebSocket server on port 10000
const wss = new WebSocket.Server({ port: 10000 });

wss.on('connection', function connection(ws) {
  console.log('✅ WebSocket connection established');

  ws.on('message', function incoming(message) {
    let data;
    try {
      // Parse the incoming JSON
      data = JSON.parse(message.toString());
    } catch (err) {
      console.error('❌ Failed to parse incoming message:', err);
      return;
    }

    console.log('🔹 Event:', data.event);

    if (data.event === 'media' && data.media && data.media.payload) {
      // Convert audio payload from base64 to Buffer
      const audioBuffer = Buffer.from(data.media.payload, 'base64');
      console.log('🔊 Received audio buffer (first 10 bytes):', audioBuffer.slice(0, 10));
    }

    if (data.event === 'start') {
      console.log('🟢 Call started:', JSON.stringify(data.start, null, 2));
    }

    if (data.event === 'stop') {
      console.log('🔴 Call stopped.');
    }
  });

  ws.on('close', function close() {
    console.log('❎ WebSocket connection closed');
  });
});

console.log('🌐 WebSocket server listening on port 10000');
