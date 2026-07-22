# Minimal demo/CI image: builds the library and serves the static example.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm install --no-fund --no-audit
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY examples/vanilla ./examples/vanilla
RUN npm install --omit=dev --no-fund --no-audit http-server
EXPOSE 8080
CMD ["npx", "http-server", "examples/vanilla", "-p", "8080"]
