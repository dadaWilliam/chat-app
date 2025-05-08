#!/bin/sh

echo "Waiting for MongoDB and Redis to be ready..."
sleep 10

echo "Waiting for Kafka to be ready..."

# Function to check if Kafka is ready
check_kafka() {
  # First check if the hostname resolves
  if ! getent hosts kafka; then
    echo "Cannot resolve Kafka hostname. Network issue."
    return 1
  fi

  # Try to establish a TCP connection to Kafka
  if ! nc -z kafka 29092; then
    echo "Cannot connect to Kafka on port 29092"
    return 1
  fi

  # Now try to use the Kafka API
  node -e "
    const { Kafka } = require('kafkajs');
    const kafka = new Kafka({
      clientId: 'check-kafka',
      brokers: ['kafka:29092']
    });
    const admin = kafka.admin();
    let connected = false;
    
    const timeout = setTimeout(() => {
      if (!connected) {
        console.error('Kafka connection timeout');
        process.exit(1);
      }
    }, 5000);
    
    admin.connect()
      .then(() => {
        connected = true;
        clearTimeout(timeout);
        console.log('Kafka is ready!');
        admin.disconnect();
        process.exit(0);
      })
      .catch(error => {
        clearTimeout(timeout);
        console.error('Kafka is not ready:', error);
        process.exit(1);
      });
  "
  return $?
}

# Maximum retries
MAX_RETRIES=30
RETRY_COUNT=0

# Keep trying until Kafka is ready or max retries reached
until check_kafka || [ $RETRY_COUNT -ge $MAX_RETRIES ]; do
  RETRY_COUNT=$((RETRY_COUNT+1))
  echo "Kafka is not ready yet, waiting... (Attempt $RETRY_COUNT/$MAX_RETRIES)"
  sleep 5
done

if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
  echo "Maximum retries reached. Continuing anyway..."
else
  echo "Kafka connection established!"
fi

# Setup Kafka topics
echo "Setting up Kafka topics..."
node setup-kafka-topics.js || echo "Failed to set up Kafka topics, but continuing..."

# Start the application
echo "Starting chat application..."
exec node server.js