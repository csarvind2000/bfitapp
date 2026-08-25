FROM node:22-alpine

WORKDIR /app

# Install deps from the lockfile only, before copying the rest of the source.
# This keeps the container's node_modules built for the image's own platform
# (Alpine/musl) instead of whatever got copied in from the host, and lets
# Docker cache this layer when only source files change.
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci
RUN npx patch-package

COPY . .

CMD ["npm", "run", "dev"]
