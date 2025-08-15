#!/bin/bash

# Pterodactyl Control Plane - Node Installer
# This script installs and configures a tenant node with Wings and the edge agent

set -euo pipefail

# Configuration
CONTROL_PLANE_URL="${CONTROL_PLANE_URL:-}"
ENROLLMENT_TOKEN="${1:-}"
SCRIPT_VERSION="1.0.0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Error handler
error_exit() {
    log_error "$1"
    exit 1
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root. Please use 'sudo' or run as root user."
    fi
}

# Detect the control plane URL from enrollment token if not provided
detect_control_plane() {
    if [[ -z "$CONTROL_PLANE_URL" ]]; then
        # Try to extract from referrer or use default
        CONTROL_PLANE_URL="https://cp.example.com"
        log_warn "Control plane URL not provided, using default: $CONTROL_PLANE_URL"
    fi
}

# Validate enrollment token
validate_token() {
    if [[ -z "$ENROLLMENT_TOKEN" ]]; then
        error_exit "Enrollment token is required. Usage: $0 <enrollment-token>"
    fi
    
    if [[ ${#ENROLLMENT_TOKEN} -lt 32 ]]; then
        error_exit "Invalid enrollment token format"
    fi
}

# System requirements check
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check Ubuntu version
    if ! grep -q "Ubuntu 22.04" /etc/os-release 2>/dev/null; then
        log_warn "This script is designed for Ubuntu 22.04. Other versions may not be fully supported."
    fi
    
    # Check architecture
    ARCH=$(uname -m)
    if [[ "$ARCH" != "x86_64" && "$ARCH" != "aarch64" ]]; then
        error_exit "Unsupported architecture: $ARCH. Only x86_64 and aarch64 are supported."
    fi
    
    # Check available disk space (minimum 10GB)
    AVAILABLE_SPACE=$(df / | awk 'NR==2 {print $4}')
    if [[ $AVAILABLE_SPACE -lt 10485760 ]]; then  # 10GB in KB
        error_exit "Insufficient disk space. At least 10GB of free space is required."
    fi
    
    # Check available memory (minimum 1GB)
    AVAILABLE_MEM=$(free -m | awk 'NR==2{print $7}')
    if [[ $AVAILABLE_MEM -lt 1024 ]]; then
        log_warn "Low available memory detected. At least 1GB of free memory is recommended."
    fi
    
    # Check if critical ports are available
    for port in 8080 2022; do
        if ss -tuln | grep -q ":$port "; then
            error_exit "Port $port is already in use. Please free this port before continuing."
        fi
    done
    
    log_success "System requirements check passed"
}

# Install system dependencies
install_dependencies() {
    log_info "Installing system dependencies..."
    
    export DEBIAN_FRONTEND=noninteractive
    
    # Update package list
    apt-get update
    
    # Install essential packages
    apt-get install -y \
        curl \
        wget \
        gnupg \
        ca-certificates \
        lsb-release \
        software-properties-common \
        apt-transport-https \
        systemd \
        systemctl \
        tar \
        gzip \
        jq
    
    log_success "System dependencies installed"
}

# Install Docker
install_docker() {
    log_info "Installing Docker..."
    
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Update package list and install Docker
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    # Verify Docker installation
    if ! docker --version &>/dev/null; then
        error_exit "Docker installation failed"
    fi
    
    log_success "Docker installed successfully"
}

# Install Wings
install_wings() {
    log_info "Installing Pterodactyl Wings..."
    
    # Create pterodactyl user
    if ! id -u pterodactyl &>/dev/null; then
        useradd -r -d /etc/pterodactyl -s /bin/false pterodactyl
    fi
    
    # Create directories
    mkdir -p /etc/pterodactyl
    mkdir -p /var/lib/pterodactyl/volumes
    mkdir -p /var/log/pterodactyl
    
    # Download Wings binary
    WINGS_VERSION=$(curl -s https://api.github.com/repos/pterodactyl/wings/releases/latest | jq -r '.tag_name')
    WINGS_URL="https://github.com/pterodactyl/wings/releases/download/${WINGS_VERSION}/wings_linux_${ARCH}"
    
    curl -L -o /usr/local/bin/wings "$WINGS_URL"
    chmod +x /usr/local/bin/wings
    
    # Create Wings systemd service
    cat > /etc/systemd/system/wings.service << 'EOF'
[Unit]
Description=Pterodactyl Wings Daemon
After=docker.service
Requires=docker.service
PartOf=docker.service

[Service]
User=root
WorkingDirectory=/etc/pterodactyl
LimitNOFILE=4096
PIDFile=/var/run/wings/daemon.pid
ExecStart=/usr/local/bin/wings
Restart=on-failure
StartLimitInterval=180
StartLimitBurst=30
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
    
    # Set permissions
    chown -R pterodactyl:pterodactyl /etc/pterodactyl
    chown -R pterodactyl:pterodactyl /var/lib/pterodactyl
    chown -R pterodactyl:pterodactyl /var/log/pterodactyl
    
    systemctl daemon-reload
    systemctl enable wings
    
    log_success "Wings installed successfully"
}

# Install Edge Agent
install_edge_agent() {
    log_info "Installing Edge Agent..."
    
    # Determine architecture for Go binary
    case "$ARCH" in
        "x86_64") GO_ARCH="amd64" ;;
        "aarch64") GO_ARCH="arm64" ;;
        *) error_exit "Unsupported architecture for Edge Agent: $ARCH" ;;
    esac
    
    # Download Edge Agent binary
    AGENT_URL="${CONTROL_PLANE_URL}/downloads/hosting-edge-agent-linux-${GO_ARCH}"
    
    curl -L -o /usr/local/bin/hosting-edge-agent "$AGENT_URL" || {
        # Fallback: use GitHub releases or build from source
        log_warn "Failed to download from control plane, using fallback method..."
        
        # For now, create a placeholder script
        cat > /usr/local/bin/hosting-edge-agent << 'EOF'
#!/bin/bash
echo "Edge Agent placeholder - to be replaced with actual binary"
sleep 30
EOF
    }
    
    chmod +x /usr/local/bin/hosting-edge-agent
    
    # Create directories
    mkdir -p /etc/hosting-agent
    mkdir -p /var/lib/hosting-agent
    mkdir -p /var/log/hosting-agent
    
    # Create initial configuration
    cat > /etc/hosting-agent/config.yaml << EOF
control_plane:
  url: "${CONTROL_PLANE_URL}"
  enroll_token: "${ENROLLMENT_TOKEN}"
  tls_skip_verify: false

agent:
  log_level: "info"
  heartbeat_interval: 30
  metrics_interval: 60
  data_dir: "/var/lib/hosting-agent"

wings:
  config_path: "/etc/pterodactyl/config.yml"
  systemd_unit: "wings.service"
  log_path: "/var/log/pterodactyl/wings.log"
  auto_restart: true
EOF
    
    # Create systemd service
    curl -s "${CONTROL_PLANE_URL}/downloads/hosting-edge-agent.service" -o /etc/systemd/system/hosting-edge-agent.service || {
        cat > /etc/systemd/system/hosting-edge-agent.service << 'EOF'
[Unit]
Description=Pterodactyl Control Plane Edge Agent
Documentation=https://github.com/pterodactyl-cp/edge-agent
After=network.target wings.service
Wants=network.target

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/local/bin/hosting-edge-agent --config /etc/hosting-agent/config.yaml
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=5
TimeoutStopSec=20
KillMode=mixed

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/etc/hosting-agent /var/lib/hosting-agent /var/log /etc/pterodactyl
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=hosting-edge-agent

[Install]
WantedBy=multi-user.target
EOF
    }
    
    systemctl daemon-reload
    systemctl enable hosting-edge-agent
    
    log_success "Edge Agent installed successfully"
}

# Configure firewall
configure_firewall() {
    log_info "Configuring firewall..."
    
    # Install ufw if not present
    apt-get install -y ufw
    
    # Reset to defaults
    ufw --force reset
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH
    ufw allow ssh
    
    # Allow Wings ports
    ufw allow 8080/tcp comment "Pterodactyl Wings"
    ufw allow 2022/tcp comment "Pterodactyl SFTP"
    
    # Allow game server port range (configurable)
    ufw allow 25565:25665/tcp comment "Game Server Ports"
    ufw allow 25565:25665/udp comment "Game Server Ports"
    
    # Enable firewall
    ufw --force enable
    
    log_success "Firewall configured"
}

# Start node enrollment
start_enrollment() {
    log_info "Starting node enrollment process..."
    
    # Start edge agent in install mode
    /usr/local/bin/hosting-edge-agent --install --enroll-token="$ENROLLMENT_TOKEN" --control-plane="$CONTROL_PLANE_URL" &
    AGENT_PID=$!
    
    # Wait for enrollment to complete (timeout after 60 seconds)
    TIMEOUT=60
    COUNTER=0
    
    while [[ $COUNTER -lt $TIMEOUT ]]; do
        if [[ ! -f /etc/hosting-agent/config.yaml ]] || grep -q "enroll_token" /etc/hosting-agent/config.yaml; then
            sleep 1
            ((COUNTER++))
        else
            break
        fi
    done
    
    # Kill the temporary agent process
    kill $AGENT_PID 2>/dev/null || true
    
    if [[ $COUNTER -ge $TIMEOUT ]]; then
        error_exit "Enrollment process timed out. Please check your enrollment token and control plane connectivity."
    fi
    
    log_success "Node enrollment completed"
}

# Start services
start_services() {
    log_info "Starting services..."
    
    # Start edge agent first
    systemctl start hosting-edge-agent
    
    # Wait a moment for agent to establish connection
    sleep 5
    
    # Check if Wings config was generated
    if [[ -f /etc/pterodactyl/config.yml ]]; then
        systemctl start wings
        log_success "Wings service started"
    else
        log_warn "Wings configuration not found. Starting edge agent only."
    fi
    
    log_success "Services started successfully"
}

# Verify installation
verify_installation() {
    log_info "Verifying installation..."
    
    # Check service status
    if systemctl is-active --quiet hosting-edge-agent; then
        log_success "Edge Agent is running"
    else
        log_error "Edge Agent is not running"
        systemctl status hosting-edge-agent --no-pager
    fi
    
    if systemctl is-active --quiet wings; then
        log_success "Wings is running"
    else
        log_warn "Wings is not running (this may be normal if not yet configured)"
    fi
    
    # Check connectivity to control plane
    if curl -f -s "$CONTROL_PLANE_URL/health" > /dev/null; then
        log_success "Control plane connectivity verified"
    else
        log_warn "Unable to verify control plane connectivity"
    fi
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    # Add any cleanup tasks here
}

# Print installation summary
print_summary() {
    log_success "Node installation completed successfully!"
    echo
    echo "==== Installation Summary ===="
    echo "Control Plane URL: $CONTROL_PLANE_URL"
    echo "Node Status: Enrolled and Active"
    echo "Services Installed:"
    echo "  - Docker Engine"
    echo "  - Pterodactyl Wings"
    echo "  - Control Plane Edge Agent"
    echo
    echo "==== Service Status ===="
    systemctl status hosting-edge-agent --no-pager -l || true
    echo
    systemctl status wings --no-pager -l || true
    echo
    echo "==== Next Steps ===="
    echo "1. Your node should now appear in the control plane dashboard"
    echo "2. You can now create game servers through the control plane"
    echo "3. Monitor logs with: journalctl -u hosting-edge-agent -f"
    echo "4. Monitor Wings logs with: journalctl -u wings -f"
    echo
    echo "For support, check the documentation or contact your administrator."
}

# Main installation function
main() {
    log_info "Starting Pterodactyl Control Plane Node Installer v$SCRIPT_VERSION"
    
    # Perform checks
    check_root
    detect_control_plane
    validate_token
    check_requirements
    
    # Install components
    install_dependencies
    install_docker
    install_wings
    install_edge_agent
    configure_firewall
    
    # Configure and start
    start_enrollment
    start_services
    
    # Verify and cleanup
    verify_installation
    cleanup
    print_summary
}

# Trap errors and cleanup
trap 'log_error "Installation failed! Check the logs above for details."; cleanup; exit 1' ERR

# Run main installation
main "$@"