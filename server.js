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
  console.log("CONNECTED");

  let streamSid = null;

  // --- VAPI WEBSOCKET SETUP ---
  // Aapka example API Key yahan use kiya gaya hai
  const vapiWs = new WebSocket("wss://api.vapi.ai/call/web", {
    headers: {
      Authorization: "bc7a084c-cdb4-4bb6-baf1-8b8247a58f7d" // API Key
    }
  });

  vapiWs.on("open", () => {
    console.log("Connected to Vapi AI");

    // Vapi se connect hote hi Assistant start karne ka command
    const startMessage = {
      type: "start",
      assistantId: "d7fdd364-4ac1-459f-a8ac-3702535dba07" // Aapka example Assistant ID
    };
    
    vapiWs.send(JSON.stringify(startMessage));
    console.log("Start event sent to Vapi");
  });

  // 1. VAPI SE AAWAZ AAYEGI -> EXOTEL KO BHEJENGE
  vapiWs.on("message", (vapiMessage) => {
    try {
      const vapiData = JSON.parse(vapiMessage);
      
      if (vapiData.type === "audio" && vapiData.data) {
        if (streamSid) {
          const exotelMediaMessage = {
            event: "media",
            streamSid: streamSid,
            media: {
              payload: vapiData.data // AI ki aawaz (Base64)
            }
          };
          ws.send(JSON.stringify(exotelMediaMessage));
        }
      } else {
        // Audio ke alawa koi event ho toh console me dikhayega
        console.log("Vapi Event:", vapiData.type);
      }
    } catch (e) {
      console.error("Error processing Vapi message", e);
    }
  });

  vapiWs.on("error", (error) => {
    console.error("Vapi WebSocket Error:", error);
  });

  // --- EXOTEL WEBSOCKET SETUP ---
  ws.on("message", (message) => {
    const msg = message.toString();

    // 1. Start Event (Stream ID save karne ke liye)
    if (msg.includes('"event":"start"')) {
      console.log("START EVENT RECEIVED");
      const data = JSON.parse(msg);
      streamSid = data.start.streamSid; 
    }

    // 2. EXOTEL SE AAWAZ AAYEGI -> VAPI KO BHEJENGE
    if (msg.includes('"event":"media"')) {
      try {
        const data = JSON.parse(msg);
        
        if (vapiWs.readyState === WebSocket.OPEN && data.media && data.media.payload) {
           const vapiAudioMessage = {
             type: "audio", 
             data: data.media.payload // Customer ki aawaz (Base64)
           };
           vapiWs.send(JSON.stringify(vapiAudioMessage));
        }
      } catch (e) {
        console.error("Error handling Exotel media", e);
      }
    }
  });

  ws.on("close", () => {
    console.log("Exotel Connection closed");
    if (vapiWs.readyState === WebSocket.OPEN) {
      vapiWs.close(); // Exotel call cut hone par Vapi connection bhi band karein
    }
  });
});

// Server start karne ka code
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
