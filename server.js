console.log("BRIDGE FINAL VERSION (RAW AUDIO FIX) LOADED");

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => { res.send("Exotel Vapi Bridge Running - Final"); });

const wss = new WebSocket.Server({ server, path: "/media" });

wss.on("connection", async (ws) => {
  console.log("Exotel connected");
  
  let vapiWs = null;
  let exotelStreamSid = null;

  try {
    // 1. VAPI CONNECTION BANANA (Exact Sahi Format Ke Sath)
    const response = await axios.post(
      "https://api.vapi.ai/call",
      {
        assistantId: process.env.VAPI_ASSISTANT_ID,
        transport: {
          provider: "vapi.websocket",
          audioFormat: {
            format: "pcm_s16le",  // Sahi Vapi format
            container: "raw",
            sampleRate: 8000,    // Exotel se match kiya hua rate
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

    const vapiUrl = response.data.transport.websocketCallUrl;
    vapiWs = new WebSocket(vapiUrl);

    vapiWs.on("open", () => console.log("Connected to Vapi AI"));

    // 2. VAPI SE AAWAZ AAYEGI -> EXOTEL KO BHEJENGE
    vapiWs.on("message", (msg) => {
      // Vapi direct Binary (kacchi aawaz) bhejta hai
      if (Buffer.isBuffer(msg)) {
        if (ws.readyState === WebSocket.OPEN && exotelStreamSid) {
          // Exotel ko base64 format mein audio bhej rahe hain
          const exotelMediaMessage = {
            event: "media",
            stream_sid: exotelStreamSid,
            media: { payload: msg.toString("base64") }
          };
          ws.send(JSON.stringify(exotelMediaMessage));
        }
      }
    });

    vapiWs.on("error", (err) => console.log("Vapi WebSocket error:", err.message));

  } catch (err) {
    console.log("Vapi Call Creation Failed", err.message);
  }

  // 3. EXOTEL SE AAWAZ AAYEGI -> VAPI KO BHEJENGE
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.event === "start") {
        exotelStreamSid = data.start.stream_sid || data.start.streamSid;
        console.log("Stream SID Saved:", exotelStreamSid);
      }

      if (data.event === "media" && data.media && data.media.payload) {
        if (vapiWs && vapiWs.readyState === WebSocket.OPEN) {
          // Exotel Base64 bhejta hai, hum use Vapi ke liye Raw Binary mein badal rahe hain
          const audioBuffer = Buffer.from(data.media.payload, "base64");
          vapiWs.send(audioBuffer);
        }
      }
    } catch (err) {
      // Extra text/events ignore karenge
    }
  });

  ws.on("close", () => {
    console.log("Exotel Call Cut.");
    if (vapiWs) vapiWs.close();
  });
});

server.listen(process.env.PORT || 3000, () => console.log("Server Started"));
