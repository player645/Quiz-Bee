# Game server only (the frontend is hosted on GitHub Pages). Not tested in the authoring environment.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src/core ./src/core
COPY server ./server
ENV PORT=8787 TRUST_PROXY=1
EXPOSE 8787
CMD ["node", "server/index.ts"]
