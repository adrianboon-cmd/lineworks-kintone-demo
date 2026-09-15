const http = require("http");

const DOMAIN = process.env.KINTONE_DOMAIN;
const APP_ID = process.env.KINTONE_APP_ID;
const TOKEN = process.env.KINTONE_API_TOKEN;

const server = http.createServer(async (req, res) => {

  if (req.url === "/") {

    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("LINE WORKS x Kintone API Running");
    return;
  }

  if (req.url === "/test") {

    const apiUrl =
      `${DOMAIN}/k/v1/records.json?app=${APP_ID}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "X-Cybozu-API-Token": TOKEN
      }
    });

    const data = await response.json();

    res.writeHead(200, {
      "Content-Type": "application/json"
    });

    res.end(JSON.stringify(data, null, 2));

    return;
  }

  res.writeHead(404);
  res.end("Not Found");

});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`Server running on ${port}`);
});
