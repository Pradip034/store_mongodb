FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --chown=node:node server.mjs seed.mjs ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
