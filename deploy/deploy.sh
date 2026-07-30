#!/bin/bash
# ============================================
#  DEPLOY to VPS
#  Usage: bash deploy.sh root@YOUR_VPS_IP
# ============================================

VPS=${1:-"root@YOUR_VPS_IP"}
REMOTE_DIR="/var/www/sudha"
LOCAL_DIR="$(dirname "$0")/../"

echo "🚀 Deploying to $VPS:$REMOTE_DIR ..."

# Create remote directory
ssh $VPS "mkdir -p $REMOTE_DIR/backend"

# Sync backend files
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.env.production' \
  --exclude 'package-lock.json' \
  "$LOCAL_DIR/backend/" "$VPS:$REMOTE_DIR/backend/"

# Sync frontend files
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'backend' \
  --exclude '.git' \
  --exclude 'deploy' \
  "$LOCAL_DIR/" "$VPS:$REMOTE_DIR/"

# Install deps + restart
ssh $VPS "cd $REMOTE_DIR/backend && npm install --production && pm2 restart sudha-wellness || pm2 start ecosystem.config.js --env production"

echo "✅ Deployed successfully!"
echo "   Check: pm2 logs sudha-wellness"
