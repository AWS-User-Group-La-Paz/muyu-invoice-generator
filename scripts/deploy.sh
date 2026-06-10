#!/bin/bash
set -e

echo "Starting Muyu Invoice Generator Deployment..."

# Navigate to app directory (assumed location on EC2)
cd /opt/muyu-invoice-generator || exit 1

# Pull latest changes
echo "Pulling latest code from master..."
git checkout master
git pull origin master

# Install dependencies strictly
echo "Installing dependencies..."
npm ci

# Restart the application
echo "Restarting systemd service..."
sudo systemctl restart muyu-invoice

echo "Deployment complete! Checking status..."
sudo systemctl status muyu-invoice --no-pager
