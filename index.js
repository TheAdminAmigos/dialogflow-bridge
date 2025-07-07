const express = require("express");
const app = express();

app.use(express.urlencoded({ extended: false }));

app.post("/", (req, res) => {
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
