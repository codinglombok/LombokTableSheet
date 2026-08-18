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
# Assemble a flat site the same way pages.yml does — index.html imports
# '../../dist/<subpath>' for local dev; rewrite to './dist/...' so the
# flat layout resolves correctly when served by http-server.
COPY --from=build /app/dist ./site/dist
COPY examples/vanilla/ ./site/
RUN sed -i 's#\.\./\.\./dist/#./dist/#g' site/index.html
RUN npm install --omit=dev --no-fund --no-audit http-server
EXPOSE 8080
CMD ["npx", "http-server", "site", "-p", "8080"]
