# Deployment Guide for DigitalOcean

This guide covers deploying the Pterodactyl Control Plane on your DigitalOcean server.

## Server Details

- **Server IP**: `104.248.71.155`
- **Domain**: `multihost.techgamingexperts.com`
- **OS**: Ubuntu 22.04 LTS
- **Credentials**: `root` / `k#5hzDc+W5S?^C`

## Pre-Deployment Checklist

### 1. DNS Configuration
Ensure your domain points to the server:
```bash
# Check DNS resolution
nslookup multihost.techgamingexperts.com
# Should return: 104.248.71.155
```

### 2. SSH Access
Test SSH connection:
```bash
ssh root@104.248.71.155
# Use password: k#5hzDc+W5S?^C
```

### 3. Server Preparation
```bash
# Update system
apt update && apt upgrade -y

# Install git for repository access
apt install -y git

# Clone the repository
cd /tmp
git clone https://github.com/itsmaserati/multihost.git
cd multihost
```

## Deployment

### Option 1: Direct Deployment (Recommended)
```bash
# Make bootstrap script executable
chmod +x bootstrap_ubuntu22.sh

# Run installation
./bootstrap_ubuntu22.sh \
  --domain-cp multihost.techgamingexperts.com \
  --email admin@techgamingexperts.com \
  --timezone "America/New_York"
```

### Option 2: Step-by-Step Deployment
If you prefer to understand each step:

1. **System Setup**
   ```bash
   # Create deploy user
   useradd -r -d /home/deploy -s /bin/bash -m deploy
   usermod -aG sudo deploy
   
   # Set timezone
   timedatectl set-timezone "America/New_York"
   ```

2. **Install Dependencies**
   ```bash
   # Install Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   usermod -aG docker deploy
   
   # Install Docker Compose
   apt install -y docker-compose-plugin
   ```

3. **Firewall Configuration**
   ```bash
   ufw allow ssh
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw --force enable
   ```

4. **Application Setup**
   ```bash
   # Create directories
   mkdir -p /opt/hosting/app
   cp -r /tmp/pterodactyl-control-plane/* /opt/hosting/app/
   chown -R deploy:deploy /opt/hosting
   
   # Setup environment
   cd /opt/hosting/app/deploy
   cp .env.sample .env
   ```

5. **SSL and Nginx**
   ```bash
   # Install Nginx and Certbot
   apt install -y nginx certbot python3-certbot-nginx
   
   # Configure Nginx (use template from deploy/nginx/)
   # Obtain SSL certificate
   certbot --nginx -d multihost.techgamingexperts.com
   ```

6. **Start Services**
   ```bash
   cd /opt/hosting/app/deploy
   sudo -u deploy docker compose up -d --build
   ```

## Post-Deployment

### 1. Verify Installation
```bash
# Check services
systemctl status hosting-control-plane
docker compose ps

# Test endpoints
curl https://multihost.techgamingexperts.com/health
curl https://multihost.techgamingexperts.com/api/docs
```

### 2. Access Admin Panel
1. Navigate to: `https://multihost.techgamingexperts.com/admin/login`
2. Use credentials from installation output
3. Complete initial setup

### 3. Configure Pterodactyl
1. Install Pterodactyl Panel (if needed):
   ```bash
   ./installers/install_panel.sh panel.techgamingexperts.com admin@techgamingexperts.com
   ```
2. Create Application API key in panel
3. Update control plane configuration

### 4. Security Hardening
```bash
# Change default passwords
passwd root

# Disable root SSH password login
sed -i 's/#PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh

# Setup fail2ban
apt install -y fail2ban
systemctl enable fail2ban
```

## Monitoring and Maintenance

### Log Locations
- Application: `sudo docker logs hosting-control-plane`
- Web Portal: `sudo docker logs hosting-web-portal`
- Nginx: `/var/log/nginx/`
- System: `sudo journalctl -u hosting-control-plane`

### Backup Strategy
```bash
# Database backup
docker exec hosting-postgres pg_dump -U postgres pterodactyl_cp > backup-$(date +%Y%m%d).sql

# Configuration backup
tar czf config-backup-$(date +%Y%m%d).tar.gz /opt/hosting/app/deploy/.env /etc/nginx/sites-enabled/

# Upload to DigitalOcean Spaces or external storage
```

### Updates
```bash
cd /opt/hosting/app
git pull
docker compose up -d --build --force-recreate
```

## Troubleshooting

### Common Issues
1. **DNS not resolving**: Wait for DNS propagation (up to 24 hours)
2. **SSL certificate fails**: Check DNS and firewall
3. **Services not starting**: Check Docker logs and disk space
4. **502 errors**: Verify upstream services are running

### Emergency Recovery
```bash
# Restart all services
systemctl restart hosting-control-plane

# Reset to known good state
cd /opt/hosting/app/deploy
docker compose down
docker compose up -d --force-recreate
```

## Support

For deployment issues specific to your setup:
1. Check logs first: `sudo journalctl -u hosting-control-plane -f`
2. Verify DNS and SSL configuration
3. Contact support with specific error messages

## Next Steps

After successful deployment:
1. Create your first tenant
2. Test node enrollment process
3. Set up monitoring and alerting
4. Configure backup automation
5. Plan scaling strategy