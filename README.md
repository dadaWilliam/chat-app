# Chat App

Real-time chat application built with WebSockets, Redis, MongoDB, and Kafka.

## Features

- Real-time messaging with WebSockets
- Message persistence with MongoDB
- Scalable architecture using Redis and Kafka
- Containerized with Docker for easy deployment

## Prerequisites

- Node.js (v14 or higher)
- Docker and Docker Compose
- MongoDB
- Redis
- Kafka

## Getting Started

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/chat-app.git
   cd chat-app
   ```

2. Install dependencies:
   ```
   npm install
   ```

### Running with Docker

The application can be run using Docker Compose:

```
docker-compose up
```

This will start all required services (app, MongoDB, Redis, Kafka).

### Running Locally

1. Make sure MongoDB, Redis, and Kafka are running
2. Set up Kafka topics:
   ```
   npm run setup-kafka
   ```
3. Start the application:
   ```
   npm start
   ```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/chat-app
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
JWT_SECRET=your_jwt_secret
```

## Project Structure

- `server.js` - Main application entry point
- `public/` - Static assets and client-side code
- `docker-compose.yml` - Docker configuration for all services
- `setup-kafka-topics.js` - Script to set up required Kafka topics

## License

ISC
