# Render runs builds as non-root, so `playwright install --with-deps` (apt-get)
# can never work there. This image ships the exact Chromium build + system
# deps for the pinned playwright version — no post-install needed.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV PORT=4000
EXPOSE 4000
CMD ["npm", "start"]
