FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all other source code
COPY . .

# Expose port 3000 for Back4App health checks
EXPOSE 3000

# Start the bot
CMD ["npm", "start"]
