FROM node:20-slim

WORKDIR /app

# Install system dependencies and tools
# Install browser dependencies for Playwright (Playwright will install its own Chromium)
RUN apt-get update && apt-get install -y \
    curl \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and dummy script
COPY package*.json ./
COPY dummy-yt-dlp.sh ./

# Install dependencies
RUN npm ci --only=production

# Install Playwright Chromium browser and system dependencies
RUN npx playwright install chromium && \
    npx playwright install-deps chromium

# Install dummy yt-dlp and crip to the expected locations
# @harvard-lil/scoop expects executables in node_modules/@harvard-lil/scoop/executables/
RUN mkdir -p /app/node_modules/@harvard-lil/scoop/executables && \
    cp /app/dummy-yt-dlp.sh /app/node_modules/@harvard-lil/scoop/executables/yt-dlp && \
    chmod +x /app/node_modules/@harvard-lil/scoop/executables/yt-dlp && \
    (curl -L https://github.com/webrecorder/crip/releases/latest/download/crip-linux -o /app/node_modules/@harvard-lil/scoop/executables/crip 2>/dev/null && \
     chmod +x /app/node_modules/@harvard-lil/scoop/executables/crip) || \
    echo "Warning: crip installation failed, certificate capture will be disabled"

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server directly (avoids npm wrapper SIGTERM errors)
CMD ["node", "server.js"]

