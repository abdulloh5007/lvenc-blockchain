FROM node:20-alpine

LABEL maintainer="EDU Chain Team"
LABEL description="EDU Chain Blockchain Node"

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files
COPY dist ./dist
COPY config.default.json ./

# Create data directory
RUN mkdir -p /app/data

# Expose ports
EXPOSE 3001 6001

# Environment variables
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV NETWORK=mainnet

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3001/health || exit 1

# Run the node
CMD ["node", "dist/cli/cli.js", "start", "--data", "/app/data"]
