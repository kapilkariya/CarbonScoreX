FROM node:20-alpine

# bcrypt uses a native addon and may need compilation on Alpine.
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
EXPOSE 5000
CMD ["npm", "start"]
