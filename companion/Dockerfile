FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.mjs ./
USER node
ENV HOST=0.0.0.0 PORT=3101
EXPOSE 3101
CMD ["node", "server.mjs"]
