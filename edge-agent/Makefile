# Pterodactyl Control Plane Edge Agent Makefile

VERSION ?= 1.0.0
COMMIT ?= $(shell git rev-parse --short HEAD)
BUILD_TIME ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

# Go parameters
GOCMD = go
GOBUILD = $(GOCMD) build
GOCLEAN = $(GOCMD) clean
GOTEST = $(GOCMD) test
GOGET = $(GOCMD) get
GOMOD = $(GOCMD) mod

# Build parameters
BINARY_NAME = hosting-edge-agent
BUILD_DIR = bin
LDFLAGS = -ldflags "-X main.Version=$(VERSION) -X main.Commit=$(COMMIT) -X main.BuildTime=$(BUILD_TIME)"

# Platforms
PLATFORMS = linux/amd64 linux/arm64

.PHONY: all build build-all clean test deps fmt vet install uninstall systemd-install systemd-uninstall

all: clean deps test build

# Build for current platform
build:
	@echo "Building $(BINARY_NAME) for current platform..."
	@mkdir -p $(BUILD_DIR)
	$(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) .

# Build for all platforms
build-all: clean deps
	@echo "Building $(BINARY_NAME) for all platforms..."
	@mkdir -p $(BUILD_DIR)
	@for platform in $(PLATFORMS); do \
		OS=$$(echo $$platform | cut -d'/' -f1); \
		ARCH=$$(echo $$platform | cut -d'/' -f2); \
		echo "Building for $$OS/$$ARCH..."; \
		GOOS=$$OS GOARCH=$$ARCH $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-$$OS-$$ARCH .; \
	done

# Clean build artifacts
clean:
	@echo "Cleaning..."
	$(GOCLEAN)
	@rm -rf $(BUILD_DIR)

# Run tests
test:
	@echo "Running tests..."
	$(GOTEST) -v ./...

# Download dependencies
deps:
	@echo "Downloading dependencies..."
	$(GOMOD) download
	$(GOMOD) tidy

# Format code
fmt:
	@echo "Formatting code..."
	@go fmt ./...

# Vet code
vet:
	@echo "Vetting code..."
	@go vet ./...

# Install binary to system
install: build
	@echo "Installing $(BINARY_NAME) to /usr/local/bin..."
	@sudo cp $(BUILD_DIR)/$(BINARY_NAME) /usr/local/bin/
	@sudo chmod +x /usr/local/bin/$(BINARY_NAME)

# Uninstall binary from system
uninstall:
	@echo "Uninstalling $(BINARY_NAME)..."
	@sudo rm -f /usr/local/bin/$(BINARY_NAME)

# Install systemd service
systemd-install: install
	@echo "Installing systemd service..."
	@sudo mkdir -p /etc/hosting-agent
	@sudo cp configs/systemd/hosting-edge-agent.service /etc/systemd/system/
	@sudo systemctl daemon-reload
	@sudo systemctl enable hosting-edge-agent
	@echo "Service installed. Use 'sudo systemctl start hosting-edge-agent' to start."

# Uninstall systemd service
systemd-uninstall:
	@echo "Uninstalling systemd service..."
	@sudo systemctl stop hosting-edge-agent 2>/dev/null || true
	@sudo systemctl disable hosting-edge-agent 2>/dev/null || true
	@sudo rm -f /etc/systemd/system/hosting-edge-agent.service
	@sudo systemctl daemon-reload

# Development helpers
dev-deps:
	@echo "Installing development dependencies..."
	@go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

lint:
	@echo "Running linter..."
	@golangci-lint run

# Show help
help:
	@echo "Available targets:"
	@echo "  all              - Clean, download deps, test, and build"
	@echo "  build            - Build for current platform"
	@echo "  build-all        - Build for all platforms"
	@echo "  clean            - Clean build artifacts"
	@echo "  test             - Run tests"
	@echo "  deps             - Download dependencies"
	@echo "  fmt              - Format code"
	@echo "  vet              - Vet code"
	@echo "  install          - Install binary to system"
	@echo "  uninstall        - Uninstall binary from system"
	@echo "  systemd-install  - Install systemd service"
	@echo "  systemd-uninstall- Uninstall systemd service"
	@echo "  dev-deps         - Install development dependencies"
	@echo "  lint             - Run linter"
	@echo "  help             - Show this help"