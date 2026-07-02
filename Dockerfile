# Use the Node version from mise.toml on Debian slim.
FROM node:24.16.0-bookworm-slim

# Enable production behavior.
ENV NODE_ENV=production

# Run following commands from /app.
WORKDIR /app

# Copy dependency files first for build caching.
COPY package.json package-lock.json ./

# Install production dependencies and remove the npm cache.
RUN npm ci --omit=dev && npm cache clean --force

# Copy the application files.
COPY . .

# Run the application as a non-root user.
USER node

# Document the application port.
EXPOSE 3000

# Check that the application responds successfully.
# Use Node to request /health and fail if it is unavailable.
HEALTHCHECK --timeout=3s --start-period=10s \
    CMD node -e "fetch('http://127.0.0.1:3000/health').then(response => { if (!response.ok) process.exit(1) })"

# Start the application.
CMD ["node", "src/web.js"]
