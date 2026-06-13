console.log("BRIDGE VERSION 7 (JSON AUDIO FIX) LOADED");

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
  res.send("Exotel Vapi Bridge Running - Version 7");
});

const wss = new WebSocket.Server({
  server,
  path: "/media",
});

wss.on("connection", async (ws) => {
  console.log("Exotel connected");

  let vapiWs = null;
  let exotelStreamSid = null; 

  try {
    const response = await axios.post(
      "https://api.vapi.ai/call",
      {
        assistantId: process.env.VAPI_ASSISTANT_ID, 
        transport: {
          provider: "vapi.websocket",
          audioFormat: {
            format: "pcm16", // Exotel ka sahi format yahi hai
            container: "raw",
            sampleRate: 16000,
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
      try {
        // Fix: Vapi se aane wale Text (JSON) ko proper kholna
        const vapiData = JSON.parse(msg.toString());
        
        let audioBase64 = null;
        
        // Vapi ki JSON file se sirf aawaz (base64) ko alag nikalna
        if (vapiData.type === "audio" && vapiData.data) {
            audioBase64 = vapiData.data;
        } else if (vapiData.type === "message" && vapiData.message && vapiData.message.type === "audio") {
            audioBase64 = vapiData.message.data;
        } else {
            console.log("Vapi Event Received:", vapiData.type);
        }

        // Exotel ko bina text ke sirf pure aawaz bhejna
        if (audioBase64 && ws.readyState === WebSocket.OPEN && exotelStreamSid) {
          const exotelMediaMessage = {
            event: "media",
            stream_sid: exotelStreamSid,
            media: {
              payload: audioBase64 // Ab koi shor nahi aayega!
            }
          };
          ws.send(JSON.stringify(exotelMediaMessage));
        }
      } catch (e) {
        // Agar parser fail ho jaye, toh ise ignore karein
      }
    });

    vapiWs.on("close", () => {
      console.log("Vapi socket closed");
    });

    vapiWs.on("error", (err) => {
      console.log("Vapi error:", err.message);
    });

  } catch (err) {
    console.log("Vapi Call Creation Failed:", err.response?.data || err.message);
  }

  // 2. EXOTEL SE AAWAZ AAYEGI -> VAPI KO BHEJENGE
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.event === "start") {
        console.log("START EVENT RECEIVED");
        exotelStreamSid = data.start.stream_sid || data.start.streamSid; 
        console.log("Stream SID Saved:", exotelStreamSid);
      }

      if (data.event === "media") {
        if (vapiWs && vapiWs.readyState === WebSocket.OPEN && data.media && data.media.payload) {
          
          // Fix: Exotel ki aawaz ko JSON me lapet kar Vapi ko bhejna taaki AI use samajh sake
          const vapiAudioMessage = {
            type: "message",
            message: {
              type: "audio",
              data: data.media.payload
            }
          };
          vapiWs.send(JSON.stringify(vapiAudioMessage));
          
        }
      }
    } catch (err) {
      // ignore
    }
  });

  ws.on("close", () => {
    console.log("Exotel Connection closed");
    if (vapiWs) {
      vapiWs.close();
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
