const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
  res.send("Exotel Vapi Bridge Running");
});

app.get("/media", (req, res) => {
  res.send("WebSocket endpoint ready");
});

const wss = new WebSocket.Server({
  server,
  path: "/media",
});

wss.on("connection", (ws, req) => {
  console.log("Exotel connected");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.event) {
        console.log("Event:", data.event);
      }

      if (data.event === "start") {
        console.log("Call started");
      }

      if (data.event === "media") {
        console.log("Audio chunk received");
      }

      if (data.event === "stop") {
        console.log("Call ended");
      }
    } catch (err) {
      console.log("Raw message:", message.toString());
    }
  });

  ws.on("close", () => {
    console.log("Connection closed");
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
