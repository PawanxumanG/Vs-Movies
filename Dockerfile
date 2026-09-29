FROM node:20-bullseye-slim

# Install FFmpeg and required media libraries
RUN apt-get update && apt-get install -y ffmpeg curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV DOWNLOAD_DIR=/tmp/netmirror_downloads

CMD ["node", "src/bot.js"]
