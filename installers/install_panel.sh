#!/bin/bash

# Pterodactyl Panel Installer for Control Plane
# This script installs Pterodactyl Panel in Docker for co-hosting scenarios

set -euo pipefail

# Configuration
PANEL_DOMAIN="${1:-panel.example.com}"
EMAIL="${2:-admin@example.com}"
MYSQL_ROOT_PASSWORD=$(openssl rand -base64 32)
MYSQL_PASSWORD=$(openssl rand -base64 32)
PANEL_APP_KEY=""
SCRIPT_VERSION="1.0.0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

error_exit() {
    log_error "$1"
    exit 1
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root"
    fi
}

check_domain() {
    if [[ "$PANEL_DOMAIN" == "panel.example.com" ]]; then
        log_warn "Using default domain. You should update this with your actual domain."
    fi
}

install_dependencies() {
    log_info "Installing dependencies..."
    
    apt-get update
    apt-get install -y \
        curl \
        wget \
        gnupg \
        ca-certificates \
        lsb-release \
        software-properties-common \
        apt-transport-https \
        nginx \
        certbot \
        python3-certbot-nginx
}

install_docker() {
    log_info "Installing Docker..."
    
    # Add Docker's GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    systemctl start docker
    systemctl enable docker
}

create_panel_compose() {
    log_info "Creating Pterodactyl Panel Docker Compose configuration..."
    
    mkdir -p /opt/pterodactyl
    cd /opt/pterodactyl
    
    # Generate app key
    PANEL_APP_KEY=$(openssl rand -base64 32)
    
    cat > docker-compose.yml << EOF
version: '3.8'

networks:
  pterodactyl:
    driver: bridge

services:
  database:
    image: mariadb:10.5
    restart: always
    command: --default-authentication-plugin=mysql_native_password
    volumes:
      - pterodactyl_database:/var/lib/mysql
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: pterodactyl
      MYSQL_USER: pterodactyl
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    networks:
      - pterodactyl

  cache:
    image: redis:alpine
    restart: always
    networks:
      - pterodactyl

  panel:
    image: quay.io/pterodactyl/panel:latest
    restart: always
    ports:
      - "127.0.0.1:8000:80"
    volumes:
      - pterodactyl_var:/app/var/
      - pterodactyl_nginx:/etc/nginx/http.d/
      - pterodactyl_certs:/etc/letsencrypt/
      - pterodactyl_logs:/app/storage/logs/
    environment:
      APP_URL: "https://${PANEL_DOMAIN}"
      APP_TIMEZONE: "UTC"
      APP_SERVICE_AUTHOR: "${EMAIL}"
      APP_ENVIRONMENT_ONLY: "false"
      CACHE_DRIVER: "redis"
      SESSION_DRIVER: "redis"
      QUEUE_DRIVER: "redis"
      REDIS_HOST: "cache"
      DB_HOST: "database"
      DB_PORT: "3306"
      DB_DATABASE: "pterodactyl"
      DB_USERNAME: "pterodactyl"
      DB_PASSWORD: "${MYSQL_PASSWORD}"
      APP_KEY: "${PANEL_APP_KEY}"
      MAIL_DRIVER: "smtp"
      MAIL_HOST: "localhost"
      MAIL_PORT: "25"
      MAIL_FROM: "${EMAIL}"
    networks:
      - pterodactyl
    depends_on:
      - database
      - cache

  worker:
    image: quay.io/pterodactyl/panel:latest
    restart: always
    command: "php /app/artisan queue:work --verbose --tries=3 --timeout=90"
    volumes:
      - pterodactyl_var:/app/var/
      - pterodactyl_logs:/app/storage/logs/
    environment:
      APP_URL: "https://${PANEL_DOMAIN}"
      APP_TIMEZONE: "UTC"
      APP_SERVICE_AUTHOR: "${EMAIL}"
      APP_ENVIRONMENT_ONLY: "false"
      CACHE_DRIVER: "redis"
      SESSION_DRIVER: "redis"
      QUEUE_DRIVER: "redis"
      REDIS_HOST: "cache"
      DB_HOST: "database"
      DB_PORT: "3306"
      DB_DATABASE: "pterodactyl"
      DB_USERNAME: "pterodactyl"
      DB_PASSWORD: "${MYSQL_PASSWORD}"
      APP_KEY: "${PANEL_APP_KEY}"
    networks:
      - pterodactyl
    depends_on:
      - database
      - cache

volumes:
  pterodactyl_database:
  pterodactyl_var:
  pterodactyl_nginx:
  pterodactyl_certs:
  pterodactyl_logs:
EOF

    log_success "Docker Compose configuration created"
}

configure_nginx() {
    log_info "Configuring Nginx..."
    
    cat > /etc/nginx/sites-available/pterodactyl.conf << EOF
server {
    listen 80;
    server_name ${PANEL_DOMAIN};
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${PANEL_DOMAIN};

    root /var/www/pterodactyl/public;
    index index.html index.htm index.php;
    charset utf-8;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/${PANEL_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${PANEL_DOMAIN}/privkey.pem;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Robots-Tag none;
    add_header Content-Security-Policy "frame-ancestors 'self'";
    add_header X-Frame-Options DENY;
    add_header Referrer-Policy same-origin;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_redirect off;
    }

    location ~ /\.ht {
        deny all;
    }
}
EOF

    # Enable the site
    ln -sf /etc/nginx/sites-available/pterodactyl.conf /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test nginx configuration
    nginx -t
}

obtain_ssl_certificate() {
    log_info "Obtaining SSL certificate..."
    
    # Stop nginx temporarily
    systemctl stop nginx
    
    # Obtain certificate
    certbot certonly --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        -d "$PANEL_DOMAIN"
    
    # Start nginx
    systemctl start nginx
    systemctl enable nginx
}

start_panel() {
    log_info "Starting Pterodactyl Panel..."
    
    cd /opt/pterodactyl
    docker compose up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to initialize..."
    sleep 30
    
    # Run initial setup
    docker compose exec panel php artisan migrate --force
    
    log_success "Pterodactyl Panel started successfully"
}

create_admin_user() {
    log_info "Creating admin user..."
    
    cd /opt/pterodactyl
    
    # Create admin user
    docker compose exec panel php artisan p:user:make \
        --email="$EMAIL" \
        --username=admin \
        --name-first=Admin \
        --name-last=User \
        --password="$(openssl rand -base64 16)" \
        --admin=1
    
    log_success "Admin user created. Check the output above for the generated password."
}

setup_systemd_service() {
    log_info "Setting up systemd service..."
    
    cat > /etc/systemd/system/pterodactyl-panel.service << EOF
[Unit]
Description=Pterodactyl Panel
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/pterodactyl
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable pterodactyl-panel
}

print_summary() {
    log_success "Pterodactyl Panel installation completed!"
    echo
    echo "==== Installation Summary ===="
    echo "Panel URL: https://${PANEL_DOMAIN}"
    echo "Admin Email: ${EMAIL}"
    echo "MySQL Root Password: ${MYSQL_ROOT_PASSWORD}"
    echo "Panel App Key: ${PANEL_APP_KEY}"
    echo
    echo "==== Important Notes ===="
    echo "1. Save the MySQL root password securely"
    echo "2. The admin user password was displayed above"
    echo "3. Configure your Control Plane with these settings:"
    echo "   PTERODACTYL_URL=https://${PANEL_DOMAIN}"
    echo "   PTERODACTYL_API_KEY=<create-application-api-key>"
    echo
    echo "==== Next Steps ===="
    echo "1. Login to the panel at https://${PANEL_DOMAIN}"
    echo "2. Go to Admin > API > Application"
    echo "3. Create a new Application API Key with all permissions"
    echo "4. Use this API key in your Control Plane configuration"
    echo
    echo "For support, check the Pterodactyl documentation."
}

main() {
    log_info "Starting Pterodactyl Panel Installer v$SCRIPT_VERSION"
    
    check_root
    check_domain
    
    install_dependencies
    install_docker
    create_panel_compose
    configure_nginx
    obtain_ssl_certificate
    start_panel
    create_admin_user
    setup_systemd_service
    
    print_summary
}

# Usage information
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    echo "Usage: $0 [panel-domain] [email]"
    echo
    echo "Arguments:"
    echo "  panel-domain  Domain for the Pterodactyl panel (default: panel.example.com)"
    echo "  email         Email for SSL certificate and admin user (default: admin@example.com)"
    echo
    echo "Example:"
    echo "  $0 panel.mydomain.com admin@mydomain.com"
    exit 0
fi

trap 'log_error "Installation failed!"; exit 1' ERR

main "$@"