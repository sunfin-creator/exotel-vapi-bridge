console.log("BRIDGE VERSION 2 LOADED");

const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
  res.send("Exotel Vapi Bridge Running");
});

const wss = new WebSocket.Server({
  server,
  path: "/media",
});

wss.on("connection", (ws) => {
  console.log("Exotel connected");

  ws.on("message", (message) => {
    console.log("RAW:", message.toString());
  });

  ws.on("close", () => {
    console.log("Connection closed");
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
