console.log("BRIDGE VERSION 6 (EXOTEL JSON FIX) LOADED");

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
  // Exotel ko aawaz wapas bhejne ke liye stream_sid save karna zaroori hai
  let exotelStreamSid = null; 

  try {
    const response = await axios.post(
      "https://api.vapi.ai/call",
      {
        assistantId: process.env.VAPI_ASSISTANT_ID, 
        transport: {
          provider: "vapi.websocket",
          audioFormat: {
            format: "pcm16",
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

    const vapiUrl = response.data.transport.websocketCallUrl;
    console.log("Vapi WS URL:", vapiUrl);

    vapiWs = new WebSocket(vapiUrl);

    vapiWs.on("open", () => {
      console.log("Connected to Vapi");
    });

    // 1. VAPI SE AAWAZ AAYEGI -> EXOTEL KO BHEJENGE
    vapiWs.on("message", (msg) => {
      if (Buffer.isBuffer(msg)) {
        // YAHAN FIX KIYA GAYA HAI: Vapi ki raw bytes ko Base64 me convert karke JSON me lapeta
        if (ws.readyState === WebSocket.OPEN && exotelStreamSid) {
          const exotelMediaMessage = {
            event: "media",
            stream_sid: exotelStreamSid,
            media: {
              payload: msg.toString("base64")
            }
          };
          ws.send(JSON.stringify(exotelMediaMessage));
        }
      } else {
        console.log("TEXT FROM VAPI:", msg.toString());
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

  // 2. EXOTEL SE AAWAZ AAYEGI -> VAPI KO BHEJENGE
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.event === "start") {
        console.log("START EVENT");
        // Yahan Exotel ka stream_sid capture kar liya
        exotelStreamSid = data.start.stream_sid; 
        console.log("Stream SID Saved:", exotelStreamSid);
      }

      if (data.event === "media") {
        if (
          vapiWs &&
          vapiWs.readyState === WebSocket.OPEN &&
          data.media &&
          data.media.payload
        ) {
          // Exotel Base64 bhejta hai, hum use wapas Buffer (Raw Binary) banakar Vapi ko bhej rahe hain
          const audioBuffer = Buffer.from(data.media.payload, "base64");
          vapiWs.send(audioBuffer);
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
