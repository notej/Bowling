FROM node:18-alpine

WORKDIR /app

# Copy server files
COPY server/package*.json ./
RUN npm install

COPY server/ ./

# Copy frontend static files
COPY index.html ./public/
COPY css/ ./public/css/
COPY js/ ./public/js/
COPY assets/ ./public/assets/
COPY manifest.json ./public/
COPY sw.js ./public/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
