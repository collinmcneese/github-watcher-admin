// index.js
// See README.md for requirements and usage instructions.

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  const response = `
  <html>
    <center>
    This repository is made to be executed by a GitHub Actions workflow. <br />
    See README.md for more details.
    </center>
  </html>
  `;
  res.send(response);
});

app.listen(port, () => {
  console.log('Listening on http://127.0.0.1:%s', port);
});
