FROM node:20-alpine

WORKDIR /app

# Tidak ada dependency eksternal, tapi salin manifest dulu untuk caching
COPY package.json ./

COPY server.js ./
COPY public ./public

EXPOSE 3000

ENV PORT=3000

CMD ["node", "server.js"]
