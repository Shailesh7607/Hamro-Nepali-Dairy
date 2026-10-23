FROM node:25-bookworm-slim
ARG RELEASE_SHA=development
ENV RELEASE_SHA=$RELEASE_SHA
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node . .
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
