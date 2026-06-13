console.log("BRIDGE VERSION 3 (AUDIO FIX) LOADED");

const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

// --- AUDIO CONVERTER FUNCTIONS ---
// Exotel ki 8000Hz aawaz ko Vapi ke liye 16000Hz mein convert karna
function upsample8to16(buffer) {
  const length = buffer.length % 2 === 0 ? buffer.length : buffer.length - 1;
  const out = Buffer.alloc(length * 2);
  let outIdx = 0;
  for (let i = 0; i < length; i += 2) {
    const b1 = buffer[i];
    const b2 = buffer[i + 1];
    out[outIdx++] = b1;
    out[outIdx++] = b2;
    out[outIdx++] = b1; // Sample ko duplicate karke speed double kar rahe hain
    out[outIdx++] = b2;
  }
  return out;
}

// Vapi ki 16000Hz aawaz ko Exotel ke liye 8000Hz mein convert karna
function downsample16to8(buffer) {
  const length = buffer.length % 2 === 0 ? buffer.length : buffer.length - 1;
  const out = Buffer.alloc(Math.floor(length / 4) * 2);
  let outIdx = 0;
  for (let i = 0; i < length; i += 4) {
    out[outIdx++] = buffer[i]; // Ek sample rakha, agla chhod diya (speed normal ki)
    out[outIdx++] = buffer[i + 1];
  }
  return out;
}
// ----------------------------------

app.get("/", (req, res) => {
  res.send("Exotel Vapi Bridge Running - Version 3");
});

const wss = new WebSocket.Server({
  server,
  path: "/media",
});

wss.on("connection", (ws) => {
  console.log("Exotel connected");

  let exotelStreamSid = null;

  // --- VAPI WEBSOCKET SETUP ---
  const vapiWs = new WebSocket("wss://api.vapi.ai/call/web", {
    headers: {
      Authorization: "bc7a084c-cdb4-4bb6-baf1-8b8247a58f7d" // TODO: APNI ASLI VAPI KEY YAHA DALEIN
    }
  });

  vapiWs.on("open", () => {
    console.log("Connected to Vapi AI");
    const startMessage = {
      type: "start",
      assistantId: "d7fdd364-4ac1-459f-a8ac-3702535dba07" // TODO: APNA ASLI ASSISTANT ID YAHA DALEIN
    };
    vapiWs.send(JSON.stringify(startMessage));
  });

  // 1. VAPI SE AAWAZ AAYEGI -> EXOTEL KO BHEJENGE
  vapiWs.on("message", (vapiMessage) => {
    try {
      const vapiData = JSON.parse(vapiMessage);

      if (vapiData.type === "audio" && vapiData.data) {
        if (exotelStreamSid) {
          // 16kHz to 8kHz conversion kiya
          const vapiBuffer = Buffer.from(vapiData.data, 'base64');
          const exotelBuffer = downsample16to8(vapiBuffer);

          const exotelMediaMessage = {
            event: "media",
            stream_sid: exotelStreamSid, // Spelling theek ki gayi hai
            media: {
              payload: exotelBuffer.toString('base64')
            }
          };
          ws.send(JSON.stringify(exotelMediaMessage));
        }
      }
    } catch (e) {
      console.error("Error processing Vapi message", e);
    }
  });

  vapiWs.on("error", (error) => {
    console.error("Vapi WebSocket Error:", error);
  });

  // --- EXOTEL SE AAWAZ AAYEGI -> VAPI KO BHEJENGE ---
  ws.on("message", (message) => {
    const msg = message.toString();

    if (msg.includes('"event":"start"')) {
      console.log("START EVENT RECEIVED");
      const data = JSON.parse(msg);
      // Exotel ka stream_sid save kar rahe hain
      exotelStreamSid = data.start.stream_sid || data.start.streamSid; 
      console.log("Stream SID Saved:", exotelStreamSid);
    }

    if (msg.includes('"event":"media"')) {
      try {
        const data = JSON.parse(msg);

        if (vapiWs.readyState === WebSocket.OPEN && data.media && data.media.payload) {
           // 8kHz to 16kHz conversion kiya
           const exotelBuffer = Buffer.from(data.media.payload, 'base64');
           const vapiBuffer = upsample8to16(exotelBuffer);

           const vapiAudioMessage = {
             type: "audio",
             data: vapiBuffer.toString('base64')
           };
           vapiWs.send(JSON.stringify(vapiAudioMessage));
        }
      } catch (e) {
        // Ignored to prevent console spam
      }
    }
  });

  ws.on("close", () => {
    console.log("Exotel Connection closed");
    if (vapiWs.readyState === WebSocket.OPEN) {
      vapiWs.close();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
