FROM node:20-bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y ffmpeg curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV DOWNLOAD_DIR=/tmp/netmirror_downloads
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/bot.js"]
