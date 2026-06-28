# Hardened Node 24 Alpine image with npm for dependency install.
FROM dhi.io/node:24-alpine-dev AS deps

# Enables production behavior in Node dependencies.
ENV NODE_ENV=production

# All following commands run from /app.
WORKDIR /app

# Copy dependency manifests first for better Docker layer caching.
COPY package.json package-lock.json ./

# Install locked production dependencies.
RUN ["npm", "ci", "--omit=dev"]

# Remove npm cache without requiring a shell.
RUN ["npm", "cache", "clean", "--force"]

# Hardened Node 24 Alpine runtime image.
FROM dhi.io/node:24-alpine3.23

# Enables production behavior in Node dependencies.
ENV NODE_ENV=production

# All following commands run from /app.
WORKDIR /app

# Copy installed production dependencies from the build stage.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Copy app files and make the non-root user own them.
COPY --chown=node:node . .

# Run the app without root privileges.
USER node

# Documents the port the app listens on.
EXPOSE 3000

# Checks the existing /health endpoint without requiring a shell.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Starts the server directly, without npm as a wrapper.
CMD ["node", "src/web.js"]
