const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");

const app = express();
const server = http.createServer(app);

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;

app.get("/", (req, res) => {
  res.send("Exotel Vapi Bridge Running");
});

const wss = new WebSocket.Server({
  server,
  path: "/media",
});

wss.on("connection", async (exotelWs) => {
  console.log("Exotel connected");

  let vapiWs = null;

  try {
    const response = await axios.post(
      "https://api.vapi.ai/call",
      {
        assistantId: VAPI_ASSISTANT_ID,
        transport: {
          provider: "vapi.websocket"
        }
      },
      {
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const websocketCallUrl =
      response.data.transport.websocketCallUrl;

    console.log("Vapi WS URL:", websocketCallUrl);

    vapiWs = new WebSocket(websocketCallUrl);

    vapiWs.on("open", () => {
      console.log("Connected to Vapi");
    });

    vapiWs.on("message", (data) => {
      console.log("Message from Vapi");
    });

    vapiWs.on("close", () => {
      console.log("Vapi closed");
    });

  } catch (err) {
    console.error(
      "Failed to create Vapi call:",
      err?.response?.data || err.message
    );
  }

  exotelWs.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.event === "start") {
        console.log("START EVENT");
        console.log(JSON.stringify(data, null, 2));
      }

      if (data.event === "media") {
        console.log("MEDIA EVENT RECEIVED");

        if (
          vapiWs &&
          vapiWs.readyState === WebSocket.OPEN &&
          data.media &&
          data.media.chunk
        ) {
          // Temporary test forwarding
          vapiWs.send(Buffer.from(data.media.chunk, "base64"));
        }
      }

      if (data.event === "stop") {
        console.log("STOP EVENT");
      }

    } catch (e) {
      console.log("RAW:", message.toString());
    }
  });

  exotelWs.on("close", () => {
    console.log("Exotel disconnected");

    if (vapiWs) {
      vapiWs.close();
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
