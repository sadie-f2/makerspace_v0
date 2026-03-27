#!/bin/bash
# One-time server setup for Ubuntu 24.04.
# Run as root or with sudo: sudo bash provision.sh
set -e

APP_DIR=/srv/makerspace/app
BACKUP_DIR=/srv/backup/db

echo "==> Installing system packages"
apt-get update -qq
apt-get install -y ca-certificates curl gnupg python3 nginx certbot python3-certbot-nginx

echo "==> Adding Docker official apt repository"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -qq
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Enabling Docker"
systemctl enable --now docker

echo "==> Creating backup directory"
mkdir -p "$BACKUP_DIR"

echo "==> Installing backup cron (2am nightly)"
cat > /srv/backup/pg_backup.sh << 'BACKUPEOF'
#!/bin/bash
set -e
BACKUP_DIR=/srv/backup/db
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d)
FILENAME="makerspace_${DATE}.sql.gz"
docker compose -f /srv/makerspace/app/docker-compose.yml exec -T db \
  pg_dump -U makerspace makerspace | gzip > "$BACKUP_DIR/$FILENAME"
find "$BACKUP_DIR" -name "makerspace_*.sql.gz" -mtime +30 -delete
echo "Backup complete: $FILENAME"
BACKUPEOF
chmod +x /srv/backup/pg_backup.sh

CRON_LINE="0 2 * * * /srv/backup/pg_backup.sh >> /var/log/pg_backup.log 2>&1"
( crontab -l 2>/dev/null | grep -qF "$CRON_LINE" ) \
  || ( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab -

echo ""
echo "==> Provisioning complete."
echo ""
echo "Next steps:"
echo "  1. Clone the repo:  git clone <repo> /srv/makerspace"
echo "  2. Configure env:   cp $APP_DIR/.env.example $APP_DIR/.env && nano $APP_DIR/.env"
echo "  3. Configure nginx: see nginx.conf.example in the repo"
echo "  4. Get SSL cert:    certbot --nginx -d <your-domain>"
echo "  5. Start the app:   cd $APP_DIR && docker compose up -d --build"
