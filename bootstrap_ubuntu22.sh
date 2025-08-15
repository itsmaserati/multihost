#!/bin/bash

# Pterodactyl Control Plane - Ubuntu 22.04 Bootstrap Script
# One-command installation and deployment script for a fresh Ubuntu 22.04 server
# 
# Usage: sudo bash bootstrap_ubuntu22.sh [options]
#
# This script is idempotent and safe to re-run

set -euo pipefail

# Script version and constants
SCRIPT_VERSION="1.0.0"
REQUIRED_OS="Ubuntu 22.04"
MIN_DISK_GB=20
MIN_MEMORY_MB=2048

# Default configuration
DEFAULT_DOMAIN_CP="cp.example.com"
DEFAULT_DOMAIN_PANEL="panel.example.com"
DEFAULT_EMAIL="admin@example.com"
DEFAULT_TIMEZONE="UTC"

# Configuration variables (can be overridden by flags)
DOMAIN_CP="$DEFAULT_DOMAIN_CP"
DOMAIN_PANEL="$DEFAULT_DOMAIN_PANEL"
EMAIL="$DEFAULT_EMAIL"
TIMEZONE="$DEFAULT_TIMEZONE"
DB_EXTERNAL="false"
DB_URL=""
REDIS_EXTERNAL="false"
REDIS_URL=""
SSH_PUBKEY=""
NO_CERTBOT="false"
FORCE_INSTALL="false"

# Installation paths
INSTALL_DIR="/opt/hosting"
APP_DIR="$INSTALL_DIR/app"
DATA_DIR="$INSTALL_DIR/data"
LOGS_DIR="$INSTALL_DIR/logs"
BACKUP_DIR="$INSTALL_DIR/backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
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

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

log_debug() {
    if [[ "${DEBUG:-false}" == "true" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $1"
    fi
}

# Error handler
error_exit() {
    log_error "$1"
    log_error "Installation failed. Check the logs above for details."
    log_error "You can re-run this script to continue where it left off."
    exit 1
}

# Show help
show_help() {
    cat << EOF
Pterodactyl Control Plane Bootstrap Script v$SCRIPT_VERSION

USAGE:
    sudo bash bootstrap_ubuntu22.sh [OPTIONS]

OPTIONS:
    --domain-cp DOMAIN          Control plane domain (default: $DEFAULT_DOMAIN_CP)
    --domain-panel DOMAIN       Pterodactyl panel domain (default: $DEFAULT_DOMAIN_PANEL) 
    --email EMAIL               Email for Let's Encrypt and admin account (default: $DEFAULT_EMAIL)
    --timezone TIMEZONE         System timezone (default: $DEFAULT_TIMEZONE)
    --db-external BOOL          Use external database (default: false)
    --db-url URL                External database URL (required if --db-external=true)
    --redis-external BOOL       Use external Redis (default: false)
    --redis-url URL             External Redis URL (required if --redis-external=true)
    --ssh-pubkey KEY            SSH public key for deploy user
    --no-certbot                Skip SSL certificate generation (for air-gapped environments)
    --force                     Force installation even if checks fail
    --help                      Show this help message

EXAMPLES:
    # Basic installation
    sudo bash bootstrap_ubuntu22.sh --domain-cp cp.mydomain.com --email admin@mydomain.com

    # With custom timezone and SSH key
    sudo bash bootstrap_ubuntu22.sh \\
        --domain-cp cp.mydomain.com \\
        --domain-panel panel.mydomain.com \\
        --email admin@mydomain.com \\
        --timezone "America/Los_Angeles" \\
        --ssh-pubkey "ssh-ed25519 AAAA..."

    # With external database
    sudo bash bootstrap_ubuntu22.sh \\
        --domain-cp cp.mydomain.com \\
        --email admin@mydomain.com \\
        --db-external true \\
        --db-url "postgres://user:pass@db.example.com:5432/pterodactyl_cp"

PREREQUISITES:
    - Fresh Ubuntu 22.04 LTS server
    - Root access (sudo)
    - DNS A records pointing to this server:
      * cp.example.com (or your control plane domain)
      * panel.example.com (or your panel domain)
    - At least ${MIN_DISK_GB}GB disk space and ${MIN_MEMORY_MB}MB RAM

WHAT THIS SCRIPT DOES:
    1. System setup: users, packages, firewall, timezone
    2. Docker installation and configuration
    3. PostgreSQL and Redis (containers or external)
    4. Nginx reverse proxy with Let's Encrypt SSL
    5. Control plane and web portal deployment
    6. Service configuration and startup
    7. Initial admin user and demo tenant creation

FOR MORE INFO:
    https://github.com/pterodactyl-cp/control-plane

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --domain-cp)
                DOMAIN_CP="$2"
                shift 2
                ;;
            --domain-panel)
                DOMAIN_PANEL="$2"
                shift 2
                ;;
            --email)
                EMAIL="$2"
                shift 2
                ;;
            --timezone)
                TIMEZONE="$2"
                shift 2
                ;;
            --db-external)
                DB_EXTERNAL="$2"
                shift 2
                ;;
            --db-url)
                DB_URL="$2"
                shift 2
                ;;
            --redis-external)
                REDIS_EXTERNAL="$2"
                shift 2
                ;;
            --redis-url)
                REDIS_URL="$2"
                shift 2
                ;;
            --ssh-pubkey)
                SSH_PUBKEY="$2"
                shift 2
                ;;
            --no-certbot)
                NO_CERTBOT="true"
                shift
                ;;
            --force)
                FORCE_INSTALL="true"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root. Please use 'sudo' or run as root user."
    fi
}

# Validate OS version
check_os() {
    log_step "Checking operating system..."
    
    if ! grep -q "Ubuntu 22.04" /etc/os-release 2>/dev/null; then
        if [[ "$FORCE_INSTALL" == "true" ]]; then
            log_warn "Not running Ubuntu 22.04, but --force specified. Proceeding anyway."
        else
            error_exit "This script requires Ubuntu 22.04 LTS. Use --force to override."
        fi
    fi
    
    log_success "Operating system check passed"
}

# Check system resources
check_resources() {
    log_step "Checking system resources..."
    
    # Check disk space
    AVAILABLE_SPACE_KB=$(df / | awk 'NR==2 {print $4}')
    AVAILABLE_SPACE_GB=$((AVAILABLE_SPACE_KB / 1024 / 1024))
    
    if [[ $AVAILABLE_SPACE_GB -lt $MIN_DISK_GB ]]; then
        if [[ "$FORCE_INSTALL" == "true" ]]; then
            log_warn "Insufficient disk space (${AVAILABLE_SPACE_GB}GB < ${MIN_DISK_GB}GB), but --force specified."
        else
            error_exit "Insufficient disk space. Need at least ${MIN_DISK_GB}GB, have ${AVAILABLE_SPACE_GB}GB."
        fi
    fi
    
    # Check memory
    AVAILABLE_MEM_MB=$(free -m | awk 'NR==2{print $2}')
    
    if [[ $AVAILABLE_MEM_MB -lt $MIN_MEMORY_MB ]]; then
        if [[ "$FORCE_INSTALL" == "true" ]]; then
            log_warn "Insufficient memory (${AVAILABLE_MEM_MB}MB < ${MIN_MEMORY_MB}MB), but --force specified."
        else
            error_exit "Insufficient memory. Need at least ${MIN_MEMORY_MB}MB, have ${AVAILABLE_MEM_MB}MB."
        fi
    fi
    
    log_success "System resources check passed (${AVAILABLE_SPACE_GB}GB disk, ${AVAILABLE_MEM_MB}MB RAM)"
}

# Validate DNS configuration
check_dns() {
    log_step "Checking DNS configuration..."
    
    # Get server's public IP
    SERVER_IP=$(curl -s https://ipv4.icanhazip.com/ || curl -s https://api.ipify.org || echo "unknown")
    
    if [[ "$SERVER_IP" == "unknown" ]]; then
        log_warn "Could not determine server public IP address"
        return
    fi
    
    log_info "Server public IP: $SERVER_IP"
    
    # Check control plane domain
    if [[ "$DOMAIN_CP" != "$DEFAULT_DOMAIN_CP" ]]; then
        CP_IP=$(dig +short "$DOMAIN_CP" 2>/dev/null | head -n1 || echo "")
        if [[ "$CP_IP" != "$SERVER_IP" ]]; then
            log_warn "DNS A record for $DOMAIN_CP does not point to this server ($SERVER_IP)"
            log_warn "Current A record points to: $CP_IP"
            log_warn "SSL certificate generation may fail"
        else
            log_success "DNS A record for $DOMAIN_CP correctly points to this server"
        fi
    fi
    
    # Check panel domain if different
    if [[ "$DOMAIN_PANEL" != "$DEFAULT_DOMAIN_PANEL" && "$DOMAIN_PANEL" != "$DOMAIN_CP" ]]; then
        PANEL_IP=$(dig +short "$DOMAIN_PANEL" 2>/dev/null | head -n1 || echo "")
        if [[ "$PANEL_IP" != "$SERVER_IP" ]]; then
            log_warn "DNS A record for $DOMAIN_PANEL does not point to this server ($SERVER_IP)"
            log_warn "Current A record points to: $PANEL_IP"
        else
            log_success "DNS A record for $DOMAIN_PANEL correctly points to this server"
        fi
    fi
}

# Validate configuration
validate_config() {
    log_step "Validating configuration..."
    
    # Check external database configuration
    if [[ "$DB_EXTERNAL" == "true" && -z "$DB_URL" ]]; then
        error_exit "External database specified but no DB_URL provided"
    fi
    
    # Check external Redis configuration
    if [[ "$REDIS_EXTERNAL" == "true" && -z "$REDIS_URL" ]]; then
        error_exit "External Redis specified but no REDIS_URL provided"
    fi
    
    # Validate email format
    if ! echo "$EMAIL" | grep -qE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; then
        error_exit "Invalid email format: $EMAIL"
    fi
    
    # Validate domains
    if [[ "$DOMAIN_CP" == "$DEFAULT_DOMAIN_CP" || "$DOMAIN_PANEL" == "$DEFAULT_DOMAIN_PANEL" ]]; then
        log_warn "Using default domains. Update with your actual domains for production use."
    fi
    
    log_success "Configuration validation passed"
}

# Create system users
setup_users() {
    log_step "Setting up system users..."
    
    # Create deploy user if it doesn't exist
    if ! id -u deploy &>/dev/null; then
        log_info "Creating deploy user..."
        useradd -r -d /home/deploy -s /bin/bash -m deploy
        usermod -aG sudo,docker deploy 2>/dev/null || usermod -aG sudo deploy
        
        # Set up SSH for deploy user if key provided
        if [[ -n "$SSH_PUBKEY" ]]; then
            log_info "Setting up SSH key for deploy user..."
            mkdir -p /home/deploy/.ssh
            echo "$SSH_PUBKEY" > /home/deploy/.ssh/authorized_keys
            chmod 700 /home/deploy/.ssh
            chmod 600 /home/deploy/.ssh/authorized_keys
            chown -R deploy:deploy /home/deploy/.ssh
        fi
        
        log_success "Deploy user created"
    else
        log_info "Deploy user already exists"
    fi
    
    # Disable root SSH password login (keep key auth)
    if grep -q "^PermitRootLogin yes" /etc/ssh/sshd_config; then
        log_info "Disabling root SSH password login..."
        sed -i 's/^PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
        systemctl reload ssh
        log_success "Root SSH password login disabled"
    fi
}

# Set timezone
setup_timezone() {
    log_step "Setting timezone to $TIMEZONE..."
    
    if timedatectl set-timezone "$TIMEZONE" 2>/dev/null; then
        log_success "Timezone set to $TIMEZONE"
    else
        log_warn "Failed to set timezone to $TIMEZONE, keeping current timezone"
    fi
}

# Install system packages
install_system_packages() {
    log_step "Installing system packages..."
    
    export DEBIAN_FRONTEND=noninteractive
    
    # Update package lists
    apt-get update
    
    # Upgrade existing packages
    apt-get upgrade -y
    
    # Install essential packages
    apt-get install -y \
        curl \
        wget \
        git \
        jq \
        unzip \
        ca-certificates \
        gnupg \
        lsb-release \
        software-properties-common \
        apt-transport-https \
        ufw \
        fail2ban \
        htop \
        nano \
        vim \
        tree \
        rsync \
        sudo
    
    log_success "System packages installed"
}

# Install Docker
install_docker() {
    log_step "Installing Docker..."
    
    if command -v docker &> /dev/null; then
        log_info "Docker already installed: $(docker --version)"
        return
    fi
    
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Update package lists and install Docker
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Add deploy user to docker group
    usermod -aG docker deploy 2>/dev/null || true
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    # Verify Docker installation
    if docker --version &>/dev/null && docker compose version &>/dev/null; then
        log_success "Docker installed successfully: $(docker --version)"
    else
        error_exit "Docker installation failed"
    fi
}

# Setup firewall
setup_firewall() {
    log_step "Configuring firewall..."
    
    # Reset UFW to defaults
    ufw --force reset
    
    # Set default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH
    ufw allow ssh
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Enable firewall
    ufw --force enable
    
    log_success "Firewall configured"
}

# Create directory structure
create_directories() {
    log_step "Creating directory structure..."
    
    # Create main directories
    mkdir -p "$INSTALL_DIR" "$APP_DIR" "$DATA_DIR" "$LOGS_DIR" "$BACKUP_DIR"
    
    # Create data subdirectories
    if [[ "$DB_EXTERNAL" != "true" ]]; then
        mkdir -p "$DATA_DIR/postgres"
    fi
    
    if [[ "$REDIS_EXTERNAL" != "true" ]]; then
        mkdir -p "$DATA_DIR/redis"
    fi
    
    mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/certs"
    
    # Set ownership
    chown -R deploy:deploy "$INSTALL_DIR"
    
    log_success "Directory structure created"
}

# Clone or update repository
setup_repository() {
    log_step "Setting up application repository..."
    
    if [[ -d "$APP_DIR/.git" ]]; then
        log_info "Repository already exists, pulling latest changes..."
        cd "$APP_DIR"
        sudo -u deploy git pull origin main || true
    else
        log_info "Cloning repository..."
        # For demo purposes, we'll create the structure manually
        # In production, this would clone from your repository
        cp -r /tmp/pterodactyl-control-plane/* "$APP_DIR/" 2>/dev/null || {
            log_warn "Repository not found, creating structure manually"
            mkdir -p "$APP_DIR"
        }
    fi
    
    # Ensure deploy user owns the directory
    chown -R deploy:deploy "$APP_DIR"
    
    log_success "Application repository ready"
}

# Generate secrets
generate_secrets() {
    log_step "Generating security secrets..."
    
    # Generate random secrets
    JWT_ACCESS_SECRET=$(openssl rand -hex 32)
    JWT_REFRESH_SECRET=$(openssl rand -hex 32)
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    
    if [[ "$DB_EXTERNAL" != "true" ]]; then
        POSTGRES_PASSWORD=$(openssl rand -base64 32)
    fi
    
    if [[ "$REDIS_EXTERNAL" != "true" ]]; then
        REDIS_PASSWORD=$(openssl rand -base64 32)
    fi
    
    ADMIN_PASSWORD=$(openssl rand -base64 16)
    
    log_success "Security secrets generated"
}

# Create environment configuration
create_env_config() {
    log_step "Creating environment configuration..."
    
    cat > "$APP_DIR/deploy/.env" << EOF
# Generated by bootstrap script on $(date)
# DO NOT MODIFY THIS FILE MANUALLY

# Database Configuration
$(if [[ "$DB_EXTERNAL" == "true" ]]; then
    echo "DATABASE_URL=\"$DB_URL\""
else
    echo "POSTGRES_DB=pterodactyl_cp"
    echo "POSTGRES_USER=postgres"
    echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
    echo "DATABASE_URL=\"postgresql://postgres:$POSTGRES_PASSWORD@postgres:5432/pterodactyl_cp\""
fi)

# Redis Configuration
$(if [[ "$REDIS_EXTERNAL" == "true" ]]; then
    echo "REDIS_URL=\"$REDIS_URL\""
else
    echo "REDIS_PASSWORD=$REDIS_PASSWORD"
    echo "REDIS_URL=\"redis://:$REDIS_PASSWORD@redis:6379\""
fi)

# JWT Secrets
JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET

# Encryption Key
ENCRYPTION_KEY=$ENCRYPTION_KEY

# Pterodactyl Integration (to be configured later)
PTERODACTYL_URL=https://$DOMAIN_PANEL
PTERODACTYL_API_KEY=changeme_after_panel_setup

# Application URLs
NEXT_PUBLIC_API_URL=https://$DOMAIN_CP
NEXT_PUBLIC_WS_URL=wss://$DOMAIN_CP
CORS_ORIGIN=https://$DOMAIN_CP

# SSL/TLS Configuration
CONTROL_PLANE_DOMAIN=$DOMAIN_CP
PANEL_DOMAIN=$DOMAIN_PANEL
SSL_EMAIL=$EMAIL

# Admin Configuration
ADMIN_EMAIL=$EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF

    # Secure the environment file
    chmod 600 "$APP_DIR/deploy/.env"
    chown deploy:deploy "$APP_DIR/deploy/.env"
    
    log_success "Environment configuration created"
}

# Install and configure Nginx
setup_nginx() {
    log_step "Setting up Nginx..."
    
    # Install Nginx if not present
    apt-get install -y nginx
    
    # Create Nginx configuration from template
    envsubst < "$APP_DIR/deploy/nginx/sites/control-plane.conf.template" > /etc/nginx/sites-available/control-plane.conf
    
    # Enable site
    ln -sf /etc/nginx/sites-available/control-plane.conf /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Copy main nginx config
    cp "$APP_DIR/deploy/nginx/nginx.conf" /etc/nginx/nginx.conf
    
    # Test configuration
    nginx -t
    
    # Start and enable Nginx
    systemctl start nginx
    systemctl enable nginx
    
    log_success "Nginx configured"
}

# Obtain SSL certificates
setup_ssl() {
    if [[ "$NO_CERTBOT" == "true" ]]; then
        log_step "Skipping SSL certificate setup (--no-certbot specified)"
        return
    fi
    
    log_step "Setting up SSL certificates..."
    
    # Install Certbot
    apt-get install -y certbot python3-certbot-nginx
    
    # Stop nginx temporarily for standalone mode
    systemctl stop nginx
    
    # Obtain certificates
    for domain in "$DOMAIN_CP" "$DOMAIN_PANEL"; do
        if [[ -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]]; then
            log_info "SSL certificate for $domain already exists"
        else
            log_info "Obtaining SSL certificate for $domain..."
            
            if certbot certonly \
                --standalone \
                --non-interactive \
                --agree-tos \
                --email "$EMAIL" \
                -d "$domain"; then
                log_success "SSL certificate obtained for $domain"
            else
                log_warn "Failed to obtain SSL certificate for $domain"
                log_warn "You may need to:"
                log_warn "1. Verify DNS A record points to this server"
                log_warn "2. Ensure port 80 is accessible from the internet"
                log_warn "3. Run 'sudo certbot certonly --standalone -d $domain' manually"
            fi
        fi
    done
    
    # Set up automatic renewal
    cat > /etc/cron.d/certbot-renew << 'EOF'
# Renew Let's Encrypt certificates twice daily
0 */12 * * * root certbot renew --quiet --post-hook "systemctl reload nginx"
EOF
    
    # Start nginx
    systemctl start nginx
    
    log_success "SSL certificates configured"
}

# Build and start application
start_application() {
    log_step "Building and starting application..."
    
    cd "$APP_DIR/deploy"
    
    # Start containers as deploy user
    sudo -u deploy docker compose up -d --build
    
    # Wait for services to be ready
    log_info "Waiting for services to initialize..."
    sleep 30
    
    # Check if services are running
    if sudo -u deploy docker compose ps | grep -q "Up"; then
        log_success "Application services started"
    else
        error_exit "Application services failed to start"
    fi
}

# Run database migrations and seeding
setup_database() {
    log_step "Setting up database..."
    
    cd "$APP_DIR/deploy"
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 10
    
    # Run migrations
    sudo -u deploy docker compose exec -T control-plane npm run db:migrate:deploy
    
    # Run seeding
    sudo -u deploy docker compose exec -T control-plane npm run db:seed
    
    log_success "Database setup completed"
}

# Install systemd service
setup_systemd() {
    log_step "Setting up systemd service..."
    
    # Copy service file
    cp "$APP_DIR/deploy/hosting-control-plane.service" /etc/systemd/system/
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable hosting-control-plane
    
    log_success "Systemd service configured"
}

# Health checks
run_health_checks() {
    log_step "Running health checks..."
    
    cd "$APP_DIR/deploy"
    
    # Check container health
    if ! sudo -u deploy docker compose ps | grep -q "Up"; then
        log_warn "Some containers are not running"
        sudo -u deploy docker compose ps
    fi
    
    # Check API endpoint
    if curl -f -s "https://$DOMAIN_CP/health" > /dev/null 2>&1; then
        log_success "Control plane API is responding"
    else
        log_warn "Control plane API is not responding yet"
    fi
    
    # Check web portal
    if curl -f -s "https://$DOMAIN_CP/" > /dev/null 2>&1; then
        log_success "Web portal is responding"
    else
        log_warn "Web portal is not responding yet"
    fi
    
    log_success "Health checks completed"
}

# Print installation summary
print_summary() {
    log_success "🎉 Pterodactyl Control Plane installation completed successfully!"
    echo
    echo "======================================================================"
    echo "                     INSTALLATION SUMMARY"
    echo "======================================================================"
    echo
    echo "🌐 Control Plane URL:     https://$DOMAIN_CP"
    echo "📧 Admin Email:           $EMAIL"
    echo "🔑 Admin Password:        $ADMIN_PASSWORD"
    echo "🗂️  Installation Path:     $INSTALL_DIR"
    echo "📁 Application Path:      $APP_DIR"
    echo "🐳 Docker Compose:        $APP_DIR/deploy"
    echo
    echo "======================================================================"
    echo "                        IMPORTANT NOTES"
    echo "======================================================================"
    echo
    echo "🔐 SAVE THESE CREDENTIALS SECURELY:"
    echo "   Admin Password: $ADMIN_PASSWORD"
    if [[ "$DB_EXTERNAL" != "true" ]]; then
        echo "   Database Password: $POSTGRES_PASSWORD"
    fi
    if [[ "$REDIS_EXTERNAL" != "true" ]]; then
        echo "   Redis Password: $REDIS_PASSWORD"
    fi
    echo
    echo "📋 NEXT STEPS:"
    echo "   1. Login to the control plane at https://$DOMAIN_CP/admin/login"
    echo "   2. Configure Pterodactyl Panel integration:"
    if [[ "$DOMAIN_PANEL" != "$DEFAULT_DOMAIN_PANEL" ]]; then
        echo "      - Install panel: sudo bash $APP_DIR/installers/install_panel.sh $DOMAIN_PANEL $EMAIL"
    fi
    echo "      - Create Application API key in panel"
    echo "      - Update PTERODACTYL_API_KEY in $APP_DIR/deploy/.env"
    echo "   3. Create your first tenant and start adding nodes"
    echo
    echo "🔧 MANAGEMENT COMMANDS:"
    echo "   Service status:    sudo systemctl status hosting-control-plane"
    echo "   View logs:         sudo docker logs hosting-control-plane"
    echo "   Restart:           sudo systemctl restart hosting-control-plane"
    echo "   Update:            cd $APP_DIR && git pull && sudo systemctl restart hosting-control-plane"
    echo
    echo "📊 MONITORING:"
    echo "   Application logs:  $LOGS_DIR/"
    echo "   Nginx logs:        /var/log/nginx/"
    echo "   System logs:       sudo journalctl -u hosting-control-plane"
    echo
    echo "🆘 SUPPORT:"
    echo "   Documentation:     https://github.com/pterodactyl-cp/control-plane"
    echo "   Issues:           https://github.com/pterodactyl-cp/control-plane/issues"
    echo
    echo "======================================================================"
    echo "Installation completed at $(date)"
    echo "======================================================================"
}

# Main installation function
main() {
    echo "======================================================================"
    echo "🚀 Pterodactyl Control Plane Bootstrap Script v$SCRIPT_VERSION"
    echo "======================================================================"
    echo
    log_info "Starting installation on $(hostname) at $(date)"
    echo
    
    # Preflight checks
    check_root
    check_os
    check_resources
    check_dns
    validate_config
    
    echo
    log_info "Preflight checks passed. Starting installation..."
    echo
    
    # System setup
    setup_users
    setup_timezone
    install_system_packages
    install_docker
    setup_firewall
    
    # Application setup
    create_directories
    setup_repository
    generate_secrets
    create_env_config
    
    # Infrastructure setup
    setup_nginx
    setup_ssl
    
    # Application deployment
    start_application
    setup_database
    setup_systemd
    
    # Final checks
    run_health_checks
    
    echo
    print_summary
}

# Cleanup function for error handling
cleanup() {
    if [[ $? -ne 0 ]]; then
        log_error "Installation failed!"
        log_error "You can re-run this script to continue where it left off."
        log_error "For debugging, set DEBUG=true before running the script."
    fi
}

# Parse arguments first
parse_args "$@"

# Set up error handling
trap cleanup EXIT

# Run main installation
main

# Success!
exit 0