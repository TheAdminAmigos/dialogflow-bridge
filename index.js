const express = require("express");
const app = express();

app.use(express.urlencoded({ extended: false }));

// Log EVERYTHING that comes in
app.all("*", (req, res) => {
  console.log("🔵 Incoming request:");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  res.type("text/xml");
  res.send(`
    <Response>
      <Say>Hello, this is your Dialogflow bot test. Your connection works.</Say>
    </Response>
  `);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
