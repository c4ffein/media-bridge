import { spawn } from "bun";

const SAMPLE_RATE = 48000;
const CHANNELS = 1;

console.log("Testing PipeWire loopback connectivity...\n");

// Test: Play to browser_speaker_sink AND record from browser_speaker_source simultaneously
console.log("=== Test: Loopback (play to sink, record from source) ===");

// Start recording from the source (try ID 37 = Browser Speaker Source)
const recorder = spawn({
  cmd: [
    "pw-record",
    "--target=37",
    `--rate=${SAMPLE_RATE}`,
    `--channels=${CHANNELS}`,
    "--format=s16",
    "-",
  ],
  stdout: "pipe",
  stderr: "pipe",
});

(async () => {
  const reader = recorder.stderr.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const msg = decoder.decode(value).trim();
    if (msg) console.log("[pw-record stderr]", msg);
  }
})();

let recordBytes = 0;
(async () => {
  const reader = recorder.stdout.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    recordBytes += value.length;
    if (recordBytes <= 20000 || recordBytes % 48000 < value.length) {
      console.log(`[pw-record] Received ${value.length} bytes (total: ${recordBytes})`);
    }
  }
})();

// Wait a moment for recorder to connect, then play to the sink
await Bun.sleep(500);

console.log("[pw-play] Playing 440Hz tone to Browser Speaker Sink (ID 38)...");
const player = spawn({
  cmd: [
    "pw-play",
    "--target=38",
    `--rate=${SAMPLE_RATE}`,
    `--channels=${CHANNELS}`,
    "--format=s16",
    "-",
  ],
  stdin: "pipe",
  stderr: "pipe",
});

(async () => {
  const reader = player.stderr.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const msg = decoder.decode(value).trim();
    if (msg) console.log("[pw-play stderr]", msg);
  }
})();

// Generate and send a 440Hz tone
const duration = 2; // seconds
const samples = SAMPLE_RATE * duration;
const buffer = new Int16Array(samples);
for (let i = 0; i < samples; i++) {
  buffer[i] = Math.sin(2 * Math.PI * 440 * i / SAMPLE_RATE) * 32767 * 0.5;
}
player.stdin.write(new Uint8Array(buffer.buffer));
player.stdin.end();

player.exited.then((code) => {
  console.log(`[pw-play] Exited with code ${code}`);
});

// Wait and check results
await Bun.sleep(3000);

console.log(`\n=== Results ===`);
console.log(`[pw-record] Total bytes received: ${recordBytes}`);
if (recordBytes > 0) {
  console.log("SUCCESS: Loopback is working!");
} else {
  console.log("FAILED: No data received from loopback");

  // Show wpctl status for debugging
  console.log("\n=== wpctl status ===");
  const status = spawn({ cmd: ["wpctl", "status"], stdout: "pipe" });
  console.log(await new Response(status.stdout).text());
}

recorder.kill();
process.exit(0);
