import { spawn, type Subprocess } from "bun";

const PORT = process.env.PORT || 3003;
const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const FORMAT = "s16le"; // 16-bit signed little-endian

interface AudioClient {
  ws: unknown;
  parec: Subprocess | null;
  pacat: Subprocess | null;
}

const clients = new Map<unknown, AudioClient>();

// Start reading from PipeWire and streaming to WebSocket
function startCapture(client: AudioClient, ws: any) {
  console.log("[pw-record] Starting capture from browser_speaker.monitor");

  const recorder = spawn({
    cmd: [
      "pw-record",
      "--target=browser_speaker_source",
      `--rate=${SAMPLE_RATE}`,
      `--channels=${CHANNELS}`,
      "--format=s16",
      "--latency=50ms",
      "-",  // output to stdout
    ],
    stdout: "pipe",
    stderr: "pipe",
  });

  client.parec = recorder;

  // Log stderr
  (async () => {
    const reader = recorder.stderr.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        console.log("[pw-record stderr]", decoder.decode(value));
      }
    } catch (e) {
      console.error("[pw-record] stderr reader error:", e);
    }
  })();

  // Monitor process exit
  recorder.exited.then((code) => {
    console.log(`[pw-record] Process exited with code ${code}`);
  });

  // Read chunks and send to browser
  let totalBytes = 0;
  let chunkCount = 0;
  (async () => {
    const reader = recorder.stdout.getReader();
    console.log("[pw-record] Waiting for audio data...");
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("[pw-record] Stream ended");
          break;
        }
        chunkCount++;
        totalBytes += value.length;
        // Log every chunk for debugging
        if (chunkCount <= 5 || chunkCount % 100 === 0) {
          console.log(`[pw-record] Chunk #${chunkCount}: ${value.length} bytes (total: ${totalBytes})`);
        }
        if (ws.readyState === 1) {
          ws.send(value);
        } else {
          console.log("[pw-record] WebSocket not ready, state:", ws.readyState);
        }
      }
    } catch (e) {
      console.error("[pw-record] Stream error:", e);
    }
  })();
}

// Start writing to PipeWire from WebSocket data
function startPlayback(client: AudioClient) {
  console.log("[pw-play] Starting playback to browser_mic");

  const player = spawn({
    cmd: [
      "pw-play",
      "--target=browser_mic_sink",
      `--rate=${SAMPLE_RATE}`,
      `--channels=${CHANNELS}`,
      "--format=s16",
      "--latency=50ms",
      "-",  // read from stdin
    ],
    stdin: "pipe",
    stderr: "pipe",
  });

  client.pacat = player;

  // Log stderr
  (async () => {
    const reader = player.stderr.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        console.log("[pw-play stderr]", decoder.decode(value));
      }
    } catch (e) {
      console.error("[pw-play] stderr reader error:", e);
    }
  })();

  // Monitor process exit
  player.exited.then((code) => {
    console.log(`[pw-play] Process exited with code ${code}`);
  });
}

function cleanup(ws: unknown) {
  const client = clients.get(ws);
  if (client) {
    client.parec?.kill();
    client.pacat?.kill();
    clients.delete(ws);
  }
}

const server = Bun.serve({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade for audio streaming
    if (url.pathname === "/audio") {
      if (server.upgrade(req)) {
        return;
      }
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Serve static files
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file("public/index.html"));
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      console.log("Client connected");
      const client: AudioClient = { ws, parec: null, pacat: null };
      clients.set(ws, client);

      startCapture(client, ws);
      startPlayback(client);
    },

    message(ws, data) {
      const client = clients.get(ws);

      // Input validation
      if (!(data instanceof Buffer) && !(data instanceof ArrayBuffer)) {
        console.warn("[ws] Received non-binary data, ignoring");
        return;
      }

      const size = data instanceof Buffer ? data.length : data.byteLength;

      // Reject oversized chunks (max 1MB per message)
      const MAX_CHUNK_SIZE = 1024 * 1024;
      if (size > MAX_CHUNK_SIZE) {
        console.warn(`[ws] Chunk too large (${size} bytes), ignoring`);
        return;
      }

      // Log incoming audio from browser
      console.log(`[ws] Received ${size} bytes from browser`);

      if (client?.pacat && data instanceof Buffer) {
        client.pacat.stdin.write(data);
      }
    },

    close(ws) {
      console.log("Client disconnected");
      cleanup(ws);
    },

    error(ws, error) {
      console.error("WebSocket error:", error);
      cleanup(ws);
    },
  },
});

console.log(`
🎵 Media Bridge running on http://localhost:${PORT}

Make sure you've run: make setup

Using PipeWire native tools (pw-record/pw-play)

Audio flow:
  Browser 🎤 → WebSocket → browser_mic (virtual source)
  Browser 🔊 ← WebSocket ← browser_speaker.monitor
`);
