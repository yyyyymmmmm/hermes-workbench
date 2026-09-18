FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
COPY web ./web
COPY ui ./ui
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=4317 DATA_DIR=/data SECURE_COOKIES=true
EXPOSE 4317
CMD ["node", "server/main.mjs"]
