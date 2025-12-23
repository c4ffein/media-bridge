# media-bridge

KISS virtual audio devices over WebSocket. Stream audio between a browser and a headless Linux server.

Vibe coded by Claude, nudged toward the right debugging path by an actual human.  
Long term I want to ensure this can work in Docker containers, I use them to let Claude do what they want, but recently I needed a fast way to both work with the audio and keep this level of security.

## Setup

```bash
# Install dependencies (Debian)
sudo apt install pipewire pipewire-pulse wireplumber pulseaudio-utils alsa-utils

# PipeWire config (one-time)
mkdir -p ~/.config/pipewire/pipewire.conf.d
# Copy 10-virtual-devices.conf to that directory
```

## Usage

```bash
make setup   # Start PipeWire + virtual devices
make start   # Start server on :3003
make test    # Test loopback works
make play    # Play test audio to browser
```

## How it works

```
Browser mic  ──WebSocket──▶  browser_mic_source  ──▶  Apps record from here
Browser spk  ◀──WebSocket──  browser_speaker_sink ◀──  Apps play to here
```

## Nginx (reverse proxy)

```nginx
location /sound-bridge/ {
    proxy_pass http://127.0.0.1:3003/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```
