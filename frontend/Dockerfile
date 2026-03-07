# Build stage: Node 20
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Run stage: serve static + proxy API
FROM node:20-alpine
WORKDIR /app

RUN adduser -D -g "" appuser
USER appuser

COPY --from=build /app/dist dist
COPY --from=build /app/server.js .
COPY --from=build /app/node_modules node_modules

ENV PORT=3000
ENV BACKEND_URL=http://backend:8080
EXPOSE 3000
CMD ["node", "server.js"]
