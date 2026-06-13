console.log("BRIDGE VERSION 4 LOADED");

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
res.send("Exotel Vapi Bridge Running");
});

const wss = new WebSocket.Server({
server,
path: "/media",
});

wss.on("connection", async (ws) => {
console.log("Exotel connected");

let vapiWs = null;

ws.on("message", async (message) => {
try {
const data = JSON.parse(message.toString());

```
  // START EVENT
  if (data.event === "start") {
    console.log("CONNECTED");
    console.log("START EVENT");
    console.log(JSON.stringify(data, null, 2));

    try {
      const response = await axios.post(
        "https://api.vapi.ai/call",
        {
          assistantId: process.env.VAPI_ASSISTANT_ID,
          transport: {
            provider: "vapi.websocket",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const vapiUrl =
        response.data.transport.websocketCallUrl;

      console.log("Vapi WS URL:", vapiUrl);

      vapiWs = new WebSocket(vapiUrl);

      vapiWs.on("open", () => {
        console.log("Connected to Vapi");
      });

      vapiWs.on("message", (msg) => {
        console.log(
          "Message from Vapi:",
          msg.toString().substring(0, 500)
        );
      });

      vapiWs.on("close", () => {
        console.log("Vapi disconnected");
      });

      vapiWs.on("error", (err) => {
        console.log("Vapi Error:", err.message);
      });

    } catch (err) {
      console.log(
        "Vapi Create Call Error:",
        err.response?.data || err.message
      );
    }
  }

  // MEDIA EVENT
  if (data.event === "media") {
    console.log("MEDIA EVENT RECEIVED");

    console.log(
      "VAPI STATUS:",
      vapiWs ? vapiWs.readyState : "NO SOCKET"
    );

    console.log(
      "HAS PAYLOAD:",
      !!(data.media && data.media.payload)
    );

    if (
      vapiWs &&
      vapiWs.readyState === WebSocket.OPEN &&
      data.media &&
      data.media.payload
    ) {
      const audioBuffer = Buffer.from(
        data.media.payload,
        "base64"
      );

      console.log(
        "Sending bytes:",
        audioBuffer.length
      );

      vapiWs.send(audioBuffer);
    } else {
      console.log("NOT SENDING AUDIO");
    }
  }

  // STOP EVENT
  if (data.event === "stop") {
    console.log("STOP EVENT");

    if (vapiWs) {
      vapiWs.close();
    }
  }

} catch (err) {
  console.log("RAW:", message.toString());
}
```

});

ws.on("close", () => {
console.log("Connection closed");
});
});

server.listen(process.env.PORT || 3000, () => {
console.log("Server started");
});
