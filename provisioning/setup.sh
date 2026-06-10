#!/bin/bash
set -e

# Update packages and install dependencies
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y curl git nginx postgresql postgresql-contrib

# Install Node.js v24 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs

# Configure PostgreSQL
sudo -u postgres psql -c "CREATE USER invoice_user WITH PASSWORD 'invoice_pass';"
sudo -u postgres psql -c "CREATE DATABASE invoice_db OWNER invoice_user;"

# Create application user
sudo useradd -m -s /bin/bash muyu

# Clone application
sudo git clone https://github.com/AWS-User-Group-La-Paz/muyu-invoice-generator.git /opt/muyu-invoice-generator
sudo chown -R muyu:muyu /opt/muyu-invoice-generator

# Install npm dependencies
cd /opt/muyu-invoice-generator || exit 1
sudo -u muyu npm ci

# Setup systemd service
sudo cp /tmp/muyu-invoice.service /etc/systemd/system/muyu-invoice.service
sudo systemctl daemon-reload
sudo systemctl enable muyu-invoice

# Setup Nginx
sudo rm -f /etc/nginx/sites-enabled/default
sudo cp /tmp/nginx.conf /etc/nginx/sites-available/muyu-invoice
sudo ln -s /etc/nginx/sites-available/muyu-invoice /etc/nginx/sites-enabled/
sudo systemctl enable nginx

echo "Server setup complete."
