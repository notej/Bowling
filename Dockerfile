FROM node:18
WORKDIR /app
COPY server/package*.json ./
RUN npm install
COPY server/ ./
COPY index.html ./public/
COPY css/ ./public/css/
COPY js/ ./public/js/
COPY assets/ ./public/assets/
COPY manifest.json ./public/
COPY sw.js ./public/
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["node", "server.js"]
