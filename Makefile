# Media Bridge Makefile
SHELL := /bin/bash
.ONESHELL:

export PIPEWIRE_RUNTIME_DIR := /tmp/pipewire-runtime
export XDG_RUNTIME_DIR := /tmp/pipewire-runtime

GREEN := \033[32m
BLUE := \033[34m
RESET := \033[0m

.PHONY: setup setup-config start test play help

help:
	@echo "Media Bridge - Virtual audio device over WebSocket"
	@echo ""
	@echo "Usage:"
	@echo "  make setup  - Start PipeWire and create virtual devices"
	@echo "  make start  - Start the bun server"
	@echo "  make test   - Test PipeWire loopback"
	@echo "  make play   - Play test audio to browser"

PIPEWIRE_CONF_DIR := $(HOME)/.config/pipewire/pipewire.conf.d

setup: setup-config
	@mkdir -p $(XDG_RUNTIME_DIR)
	@echo ""
	@echo -e "$(BLUE)=== Media Bridge Setup ===$(RESET)"
	@echo ""
	@echo -e "$(GREEN)Stopping existing PipeWire...$(RESET)"
	@pkill -9 wireplumber 2>/dev/null || true
	@pkill -9 pipewire 2>/dev/null || true
	@sleep 1
	@echo ""
	@echo -e "$(GREEN)Starting PipeWire...$(RESET)"
	@pipewire &
	@sleep 1
	@echo ""
	@echo -e "$(GREEN)Starting PipeWire-Pulse...$(RESET)"
	@pipewire-pulse &
	@sleep 1
	@echo ""
	@echo -e "$(GREEN)Starting WirePlumber...$(RESET)"
	@wireplumber &
	@sleep 2
	@echo ""
	@echo -e "$(BLUE)=== Checking devices ===$(RESET)"
	@echo ""
	@wpctl status
	@echo ""
	@echo -e "$(BLUE)=== Checking ports ===$(RESET)"
	@echo ""
	@pw-link -o -i
	@echo ""
	@echo -e "$(BLUE)Setup complete! Run 'make start' to start the server.$(RESET)"
	@echo ""

setup-config:
	@mkdir -p $(PIPEWIRE_CONF_DIR)
	@echo -e "$(GREEN)Writing PipeWire config...$(RESET)"
	@cat > $(PIPEWIRE_CONF_DIR)/10-media-bridge.conf << 'EOF'
	context.modules = [
	    # Dummy clock for headless servers
	    {
	        name = libpipewire-module-loopback
	        args = {
	            node.name = "dummy-clock"
	            audio.rate = 48000
	            audio.channels = 1
	            capture.props = { media.class = Audio/Sink }
	            playback.props = { media.class = Audio/Source }
	        }
	    }
	    # Browser Speaker: apps play to sink, we record from source
	    {
	        name = libpipewire-module-loopback
	        args = {
	            node.name = "browser_speaker"
	            node.description = "Browser Speaker"
	            audio.rate = 48000
	            audio.channels = 1
	            audio.position = [ MONO ]
	            capture.props = {
	                node.name = "browser_speaker_sink"
	                media.class = Audio/Sink
	                node.description = "Browser Speaker (Sink)"
	            }
	            playback.props = {
	                node.name = "browser_speaker_source"
	                media.class = Audio/Source
	                node.description = "Browser Speaker (Source)"
	            }
	        }
	    }
	    # Browser Mic: we play to sink, apps record from source
	    {
	        name = libpipewire-module-loopback
	        args = {
	            node.name = "browser_mic"
	            node.description = "Browser Microphone"
	            audio.rate = 48000
	            audio.channels = 1
	            audio.position = [ MONO ]
	            capture.props = {
	                node.name = "browser_mic_sink"
	                media.class = Audio/Sink
	                node.description = "Browser Mic (Sink)"
	            }
	            playback.props = {
	                node.name = "browser_mic_source"
	                media.class = Audio/Source
	                node.description = "Browser Mic (Source)"
	            }
	        }
	    }
	]
	EOF

start:
	bun run start

test:
	bun run test-pw

play:
	pw-play --target=browser_speaker_sink /usr/share/sounds/alsa/Front_Center.wav
