const http = require("http");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// ========================================
// Environment Variables
// ========================================

// Kintone
const KINTONE_DOMAIN = process.env.KINTONE_DOMAIN;
const KINTONE_APP_ID = process.env.KINTONE_APP_ID;
const KINTONE_API_TOKEN = process.env.KINTONE_API_TOKEN;

// LINE WORKS
const LINEWORKS_BOT_ID = process.env.LINEWORKS_BOT_ID;
const LINEWORKS_BOT_SECRET = process.env.LINEWORKS_BOT_SECRET;
const LINEWORKS_CLIENT_ID = process.env.LINEWORKS_CLIENT_ID;
const LINEWORKS_CLIENT_SECRET = process.env.LINEWORKS_CLIENT_SECRET;
const LINEWORKS_SERVICE_ACCOUNT =
  process.env.LINEWORKS_SERVICE_ACCOUNT;

// Render Environment Variable 中的 \n 要轉回真正換行
const LINEWORKS_PRIVATE_KEY = (
  process.env.LINEWORKS_PRIVATE_KEY || ""
).replace(/\\n/g, "\n");

// Access Token 快取
let tokenCache = {
  accessToken: null,
  expiresAt: 0
};

// ========================================
// 共用回應函式
// ========================================

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });

  res.end(JSON.stringify(data, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end(text);
}

// ========================================
// 讀取 HTTP Request Body
// ========================================

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString("utf8");
    });

    req.on("end", () => {
      resolve(body);
    });

    req.on("error", reject);
  });
}

// ========================================
// 驗證 LINE WORKS Callback Signature
// ========================================

function verifyLineWorksSignature(rawBody, receivedSignature) {
  if (!LINEWORKS_BOT_SECRET || !receivedSignature) {
    return false;
  }

  const calculatedSignature = crypto
    .createHmac("sha256", LINEWORKS_BOT_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  const receivedBuffer = Buffer.from(receivedSignature);
  const calculatedBuffer = Buffer.from(calculatedSignature);

  if (receivedBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    receivedBuffer,
    calculatedBuffer
  );
}

// ========================================
// 取得 LINE WORKS Access Token
// ========================================

async function getLineWorksAccessToken() {

  console.log("CLIENT_ID =", LINEWORKS_CLIENT_ID);
  console.log("SERVICE_ACCOUNT =", LINEWORKS_SERVICE_ACCOUNT);
  console.log("PRIVATE_KEY_EXISTS =", !!LINEWORKS_PRIVATE_KEY);
console.log(
  JSON.stringify(
    LINEWORKS_PRIVATE_KEY.substring(0,80)
  )
);
  const now = Math.floor(Date.now() / 1000);

  if (
    tokenCache.accessToken &&
    tokenCache.expiresAt > now + 60
  ) {
    return tokenCache.accessToken;
  }


  if (
    !LINEWORKS_CLIENT_ID ||
    !LINEWORKS_CLIENT_SECRET ||
    !LINEWORKS_SERVICE_ACCOUNT ||
    !LINEWORKS_PRIVATE_KEY
  ) {
    throw new Error(
      "LINE WORKS Client App Environment Variables 尚未完整設定"
    );
  }

  const assertion = jwt.sign(
    {
      iss: LINEWORKS_CLIENT_ID,
      sub: LINEWORKS_SERVICE_ACCOUNT,
      iat: now,
      exp: now + 3600
    },
    LINEWORKS_PRIVATE_KEY,
    {
      algorithm: "RS256"
    }
  );
  
console.log("JWT OK");
const payload = JSON.parse(
  Buffer.from(
    assertion.split(".")[1],
    "base64url"
  ).toString()
);

console.log(payload);
  const formData = new URLSearchParams();

  formData.append(
    "grant_type",
    "urn:ietf:params:oauth:grant-type:jwt-bearer"
  );
  formData.append("client_id", LINEWORKS_CLIENT_ID);
  formData.append("client_secret", LINEWORKS_CLIENT_SECRET);
  formData.append("assertion", assertion);
 formData.append(
  "scope",
  "bot bot.message"
);
console.log("TOKEN URL");
console.log(
  "https://auth.worksmobile.com/b/400781256/oauth2/v2.0/token"
);
  const response = await fetch(
  "https://auth.worksmobile.com/oauth2/v2.0/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded; charset=UTF-8"
      },
      body: formData.toString()
    }
  );
console.log("TOKEN STATUS =", response.status);
console.log("TOKEN STATUS TEXT =", response.statusText);
const text = await response.text();

console.log("TOKEN RESPONSE RAW=");
console.log(text);

let data = {};

try {
  data = JSON.parse(text);
} catch (e) {
  console.log("NOT JSON RESPONSE");
}
console.log(
  "TOKEN RESPONSE =",
  JSON.stringify(data)
);
  if (!response.ok || !data.access_token) {
    console.error(
      "LINE WORKS token error:",
      JSON.stringify(data)
    );

    throw new Error(
      `無法取得 LINE WORKS Access Token：${JSON.stringify(data)}`
    );
  }

  const expiresIn = Number(data.expires_in || 3600);

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + expiresIn
  };

  return data.access_token;
}

// ========================================
// 查詢 Kintone 客戶
// ========================================

async function findCustomer(customerNo) {
  const query = `客戶編號 = "${customerNo}" limit 1`;

  const params = new URLSearchParams({
    app: KINTONE_APP_ID,
    query
  });

  const apiUrl =
    `${KINTONE_DOMAIN}/k/v1/records.json?${params.toString()}`;

  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "X-Cybozu-API-Token": KINTONE_API_TOKEN
    }
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "Kintone API error:",
      JSON.stringify(data)
    );

    throw new Error(
      data.message || "Kintone API 查詢失敗"
    );
  }

  if (!data.records || data.records.length === 0) {
    return null;
  }

  const record = data.records[0];

  return {
    客戶編號:
      record["客戶編號"]?.value || "",
    客戶名稱:
      record["客戶名稱"]?.value || "",
    聯絡人:
      record["聯絡人"]?.value || "",
    電話:
      record["電話"]?.value || ""
  };
}

// ========================================
// 發送 LINE WORKS 訊息
// 支援 1:1 user 與群組 channel
// ========================================

async function sendLineWorksMessage(source, text) {
  const accessToken =
    await getLineWorksAccessToken();

  let apiUrl;

  if (source.channelId) {
    apiUrl =
      `https://www.worksapis.com/v1.0/bots/` +
      `${encodeURIComponent(LINEWORKS_BOT_ID)}/channels/` +
      `${encodeURIComponent(source.channelId)}/messages`;
  } else if (source.userId) {
    apiUrl =
      `https://www.worksapis.com/v1.0/bots/` +
      `${encodeURIComponent(LINEWORKS_BOT_ID)}/users/` +
      `${encodeURIComponent(source.userId)}/messages`;
  } else {
    throw new Error(
      "Callback 中沒有 userId 或 channelId"
    );
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: {
        type: "text",
        text
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    console.error(
      "LINE WORKS message error:",
      response.status,
      errorText
    );

    throw new Error(
      `LINE WORKS 回覆失敗：${response.status} ${errorText}`
    );
  }
}

// ========================================
// 處理 LINE WORKS Message Event
// ========================================

async function handleLineWorksEvent(event) {
  if (
    event.type !== "message" ||
    event.content?.type !== "text"
  ) {
    return;
  }

  const input = String(event.content.text || "").trim();

  // 接受：
  // 客戶 123456
  // 客戶　123456
  // 客戶123456
  const match = input.match(/^客戶[\s　]*(.+)$/);

  if (!match) {
    await sendLineWorksMessage(
      event.source,
      "請輸入：客戶 123456"
    );
    return;
  }

  const customerNo = match[1].trim();

  if (!customerNo) {
    await sendLineWorksMessage(
      event.source,
      "請在「客戶」後面輸入客戶編號，例如：客戶 123456"
    );
    return;
  }

  const customer = await findCustomer(customerNo);

  if (!customer) {
    await sendLineWorksMessage(
      event.source,
      `找不到客戶編號：${customerNo}`
    );
    return;
  }

  const replyText = [
    "客戶查詢結果",
    "",
    `客戶編號：${customer.客戶編號}`,
    `客戶名稱：${customer.客戶名稱}`,
    `聯絡人：${customer.聯絡人}`,
    `電話：${customer.電話}`
  ].join("\n");

  await sendLineWorksMessage(
    event.source,
    replyText
  );
}

// ========================================
// HTTP Server
// ========================================

const server = http.createServer(
  async (req, res) => {
    try {
      const requestUrl = new URL(
        req.url,
        `http://${req.headers.host || "localhost"}`
      );

      // ----------------------------------
      // 首頁
      // ----------------------------------

      if (
        req.method === "GET" &&
        requestUrl.pathname === "/"
      ) {
        sendText(
          res,
          200,
          "LINE WORKS x Kintone API Running"
        );
        return;
      }

      // ----------------------------------
      // 健康檢查
      // ----------------------------------

      if (
        req.method === "GET" &&
        requestUrl.pathname === "/health"
      ) {
        sendJson(res, 200, {
          status: "ok"
        });
        return;
      }

      // ----------------------------------
      // 查詢單一客戶
      // /customer/123456
      // ----------------------------------

      if (
        req.method === "GET" &&
        requestUrl.pathname.startsWith("/customer/")
      ) {
        const parts =
          requestUrl.pathname.split("/");

        const customerNo =
          decodeURIComponent(parts[2] || "").trim();

        if (!customerNo) {
          sendJson(res, 400, {
            error: "缺少客戶編號"
          });
          return;
        }

        const customer =
          await findCustomer(customerNo);

        if (!customer) {
          sendJson(res, 404, {
            error: "找不到客戶",
            客戶編號: customerNo
          });
          return;
        }

        sendJson(res, 200, customer);
        return;
      }

      // ----------------------------------
      // 列出 Kintone Records
      // ----------------------------------

      if (
        req.method === "GET" &&
        requestUrl.pathname === "/test"
      ) {
        const params = new URLSearchParams({
          app: KINTONE_APP_ID
        });

        const apiUrl =
          `${KINTONE_DOMAIN}/k/v1/records.json?` +
          params.toString();

        const response = await fetch(apiUrl, {
          method: "GET",
          headers: {
            "X-Cybozu-API-Token":
              KINTONE_API_TOKEN
          }
        });

        const data = await response.json();

        sendJson(res, response.status, data);
        return;
      }

      // ----------------------------------
      // LINE WORKS Callback
      // ----------------------------------

      if (
        req.method === "POST" &&
        requestUrl.pathname === "/webhook"
      ) {
        const rawBody =
          await readRequestBody(req);

        const receivedSignature =
          req.headers["x-works-signature"];

        const receivedBotId =
          req.headers["x-works-botid"];

        if (
          String(receivedBotId) !==
          String(LINEWORKS_BOT_ID)
        ) {
          sendText(res, 401, "Invalid Bot ID");
          return;
        }

        const isValid =
          verifyLineWorksSignature(
            rawBody,
            receivedSignature
          );

        if (!isValid) {
          console.error(
            "Invalid LINE WORKS signature"
          );

          sendText(
            res,
            401,
            "Invalid signature"
          );
          return;
        }

        let event;

        try {
          event = JSON.parse(rawBody);
        } catch (error) {
          sendText(res, 400, "Invalid JSON");
          return;
        }

        // LINE WORKS 要求 Callback Server 回傳 HTTP 200
        sendText(res, 200, "OK");

        // 回覆訊息在 HTTP 200 後繼續處理
        handleLineWorksEvent(event).catch(error => {
          console.error(
            "Webhook processing error:",
            error
          );
        });

        return;
      }

      sendText(res, 404, "Not Found");
    } catch (error) {
      console.error("Server error:", error);

      if (!res.headersSent) {
        sendJson(res, 500, {
          error: "Internal Server Error",
          message: error.message
        });
      }
    }
  }
);

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
