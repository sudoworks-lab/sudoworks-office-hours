FROM node:22.22.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM node:22.22.1-bookworm-slim AS runtime
ENV HOST=0.0.0.0 NODE_ENV=production PORT=3000 STATIC_DIR=/app/dist/public BOOKING_DB_PATH=/app/data/bookings.sqlite
WORKDIR /app
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/local/server.mjs"]
