FROM node:20-alpine

WORKDIR /app

# Copy root manifest first for layer caching.
COPY package.json package-lock.json* ./

# Worker reuses isomorphic services from app/services/* and app/lib/*,
# matching the aerohub pattern. We install the full dependency tree
# rather than splitting a worker-only package.json.
RUN npm ci --omit=dev || npm install --omit=dev

# Copy only the directories the worker actually needs.
COPY app/services ./app/services
COPY app/lib ./app/lib
COPY worker ./worker

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "--import", "tsx/esm", "worker/src/index.ts"]
