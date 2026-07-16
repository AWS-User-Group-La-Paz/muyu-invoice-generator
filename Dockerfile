# Hardened Node 24 Debian 13 image with npm for dependency install.
FROM dhi.io/node:24-debian13-dev AS deps

# Enables production behavior in Node dependencies.
ENV NODE_ENV=production

# All following commands run from /app.
WORKDIR /app

# Copy dependency manifests first for better Docker layer caching.
COPY package.json package-lock.json ./

# Install locked production dependencies.
RUN ["npm", "ci", "--omit=dev"]

# Hardened Node 24 Debian 13 runtime image.
FROM dhi.io/node:24-debian13

# Enables production behavior in Node dependencies.
ENV NODE_ENV=production

# Enables vendor-neutral tracing in deployed containers.
ENV NODE_OPTIONS="--require=@opentelemetry/auto-instrumentations-node/register"
ENV OTEL_TRACES_EXPORTER=otlp
ENV OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
ENV OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces

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

# Starts the server directly, without npm as a wrapper.
CMD ["node", "src/web.js"]
