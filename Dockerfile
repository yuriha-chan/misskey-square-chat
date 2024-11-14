FROM node
WORKDIR /app

COPY backend/package.json .
RUN npm run install
COPY backend/server.js .
COPY frontend/dist/index.html .
COPY frontend/dist/close.html .
COPY frontend/dist/assets .
