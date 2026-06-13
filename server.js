console.log("BRIDGE VERSION 3 LOADED");

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
  res.send("Exotel Vapi Bridge Running");
});

let vapiWs = null;

const wss = new WebSocket.Server({
  server,
  path: "/media",
});

wss.on("connection", async (ws) => {
  console.log("Exotel connected");

  try {
    const response = await axios.post(
      "https://api.vapi.ai/call",
      {
        assistantId: process.env.VAPI_ASSISTANT_ID,
        transport: {
          provider: "vapi.websocket",
          audioFormat: {
            format: "mulaw",
            container: "raw",
            sampleRate: 8000,
          },
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
      console.log("Message from Vapi");

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    });

    vapiWs.on("close", () => {
      console.log("Vapi socket closed");
    });

    vapiWs.on("error", (err) => {
      console.log("Vapi error:", err.message);
    });

  } catch (err) {
    console.log(
      "Vapi Call Creation Failed:",
      err.response?.data || err.message
    );
  }

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.event === "start") {
        console.log("START EVENT");
        console.log(JSON.stringify(data, null, 2));
      }

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

      if (data.event === "stop") {
        console.log("STOP EVENT");
      }

    } catch (err) {
      console.log("RAW:", message.toString());
    }
  });

  ws.on("close", () => {
    console.log("Connection closed");

    if (vapiWs) {
      vapiWs.close();
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
