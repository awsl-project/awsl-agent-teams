FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/ dist/
COPY public/ public/
COPY agents/ agents/
EXPOSE 3120
CMD ["node", "dist/cli.js", "dashboard", "--port", "3120", "--host", "0.0.0.0"]
