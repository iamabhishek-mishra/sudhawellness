#!/bin/bash
# ============================================
#  SUDHA WELLNESS — FULL VPS SETUP SCRIPT
#  Run on fresh Ubuntu/Debian VPS as root
#  Usage: bash setup.sh your-domain.com
# ============================================

set -e

DOMAIN=${1:-sudhawellness.com}
APP_DIR="/var/www/sudha"
NODE_VERSION="18"
MYSQL_ROOT_PASS=$(openssl rand -base64 16)
MYSQL_APP_PASS=$(openssl rand -base64 16)
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_KEY=$(openssl rand -hex 16)

echo "============================================"
echo "  SUDHA WELLNESS — VPS SETUP"
echo "  Domain: $DOMAIN"
echo "============================================"

# ---- 1. System updates ----
echo ""
echo ">>> [1/12] Updating system..."
apt update && apt upgrade -y
apt install -y curl wget git unzip software-properties-common ufw

# ---- 2. Firewall ----
echo ""
echo ">>> [2/12] Configuring firewall..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3306/tcp
echo "y" | ufw enable

# ---- 3. Node.js ----
echo ""
echo ">>> [3/12] Installing Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt install -y nodejs
echo "Node: $(node -v) | NPM: $(npm -v)"

# ---- 4. MySQL ----
echo ""
echo ">>> [4/12] Installing MySQL..."
DEBIAN_FRONTEND=noninteractive apt install -y mysql-server
systemctl enable mysql
systemctl start mysql

# Secure MySQL
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASS}';"
mysql -e "DELETE FROM mysql.user WHERE User='';"
mysql -e "DROP DATABASE IF EXISTS test;"
mysql -e "DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';"
mysql -e "FLUSH PRIVILEGES;"

# Create app database and user
mysql -e "CREATE DATABASE IF NOT EXISTS sudha_wellness CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS 'sudha_app'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_APP_PASS}';"
mysql -e "GRANT ALL PRIVILEGES ON sudha_wellness.* TO 'sudha_app'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

echo "✅ MySQL configured. App user: sudha_app"

# ---- 5. Nginx ----
echo ""
echo ">>> [5/12] Installing Nginx..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx

# ---- 6. Certbot (SSL) ----
echo ""
echo ">>> [6/12] Installing Certbot for SSL..."
apt install -y certbot python3-certbot-nginx

# ---- 7. Create app directory ----
echo ""
echo ">>> [7/12] Setting up app directory..."
mkdir -p $APP_DIR/backend
mkdir -p /var/log/sudha

# ---- 8. Copy app files ----
echo ""
echo ">>> [8/12] Copying application files..."
echo "   Upload your project files to $APP_DIR/"
echo "   Or use: scp -r ./webinar/* root@YOUR_IP:$APP_DIR/"

# ---- 9. Create .env.production ----
echo ""
echo ">>> [9/12] Creating production .env..."
cat > $APP_DIR/backend/.env << EOF
PORT=3000
NODE_ENV=production
APP_PUBLIC_URL=https://${DOMAIN}
ADMIN_KEY=${ADMIN_KEY}
ADMIN_EMAIL=admin@${DOMAIN}
ADMIN_PASS=CHANGE_THIS_NOW
JWT_SECRET=${JWT_SECRET}
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=sudha_app
DB_PASSWORD=${MYSQL_APP_PASS}
DB_NAME=sudha_wellness
RAZORPAY_KEY_ID=rzp_live_REPLACE_ME
RAZORPAY_KEY_SECRET=REPLACE_ME
PHONEPE_MERCHANT_ID=SUDHAWELLONLINE
PHONEPE_SALT_KEY=4d1aca6e-5298-47d2-b93b-59baf21ce237
PHONEPE_SALT_INDEX=1
PHONEPE_ENV=PROD
PHONEPE_AMOUNT_PAISE=9900
META_WHATSAPP_TOKEN=EAAflHcwhgosBR5lHZC55tN0fgZBEOvj7E6ZCgxDiZCTbvuue3rTC6kxpKKFTgPfy7gQnob2da9cmBda8BTIZAZALtvrlr0SrEdvZCjgbqAUazZCIZBP5Ozd3nVEkJYM53L3pZAH0zBzfe9iZB1Or3swrkViNfj3mpZAcT0ooVVRVtIFFpZCwh3k3tDquUg0qbTHjrhAZDZD
META_PHONE_NUMBER_ID=1150183811515275
META_WABA_ID=1579218077205060
META_TEMPLATE_NAME=webinar_reg_conf
META_FALLBACK_TEMPLATE_NAME=hello_world
META_TEMPLATE_LANGUAGE=en_US
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=support@${DOMAIN}
SMTP_PASS=CHANGE_THIS
EMAIL_FROM="Sudha Wellness <support@${DOMAIN}>"
MEET_LINK=https://meet.google.com/kpc-doyj-bzm
MEETING_ID=
MEETING_PASSWORD=
WEBINAR_DATE_STR=Tuesday, 21st July 2026 at 7:00 PM IST
EOF

echo "✅ .env created at $APP_DIR/backend/.env"

# ---- 10. Install dependencies ----
echo ""
echo ">>> [10/12] Installing Node.js dependencies..."
cd $APP_DIR/backend
npm install --production

# ---- 11. PM2 ----
echo ""
echo ">>> [11/12] Installing PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root

# ---- 12. Nginx config ----
echo ""
echo ">>> [12/12] Configuring Nginx..."
cat > /etc/nginx/sites-available/sudha << NGINX
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml text/javascript image/svg+xml;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    location ~ /\. { deny all; }
}
NGINX

ln -sf /etc/nginx/sites-available/sudha /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ---- 13. SSL ----
echo ""
echo ">>> Getting SSL certificate..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN || echo "⚠️  Run certbot manually after DNS is set up"

echo ""
echo "============================================"
echo "  ✅ SETUP COMPLETE!"
echo "============================================"
echo ""
echo "  CREDENTIALS (save these!):"
echo "  ─────────────────────────────────"
echo "  MySQL Root Pass:  $MYSQL_ROOT_PASS"
echo "  MySQL App Pass:   $MYSQL_APP_PASS"
echo "  Admin Key:        $ADMIN_KEY"
echo "  JWT Secret:       $JWT_SECRET"
echo "  ─────────────────────────────────"
echo ""
echo "  NEXT STEPS:"
echo "  1. Upload your app files to $APP_DIR/"
echo "  2. Edit $APP_DIR/backend/.env (fill RAZORPAY, SMTP, etc.)"
echo "  3. Run: cd $APP_DIR/backend && pm2 start ecosystem.config.js --env production"
echo "  4. Run: pm2 save"
echo "  5. Point your domain DNS to this server's IP"
echo ""
echo "  USEFUL COMMANDS:"
echo "  pm2 status              — check app status"
echo "  pm2 logs sudha-wellness — view logs"
echo "  pm2 restart all         — restart app"
echo "  systemctl status mysql  — check MySQL"
echo "  ufw status              — check firewall"
echo ""
