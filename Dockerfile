FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY server.js .
COPY setup-kafka-topics.js .

# Create public directory
RUN mkdir -p public

# Expose port
EXPOSE 3000

# Wait for Kafka to be ready before starting the app
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set the entrypoint
ENTRYPOINT ["docker-entrypoint.sh"]