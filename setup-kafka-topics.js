const { Kafka } = require('kafkajs');

// Default rooms from your main application
const DEFAULT_ROOMS = ['general', 'random', 'tech'];
const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'kafka:29092';
const TOPIC_PREFIX = process.env.TOPIC_PREFIX || 'chat_room_';

async function setupKafkaTopics() {
  console.log('Setting up Kafka topics...');
  
  const kafka = new Kafka({
    clientId: 'chat-app-admin',
    brokers: [KAFKA_BROKERS]
  });
  
  const admin = kafka.admin();
  
  try {
    await admin.connect();
    console.log('Connected to Kafka');
    
    // Create topics for default rooms
    const topics = DEFAULT_ROOMS.map(room => ({
      topic: `${TOPIC_PREFIX}${room}`,
      numPartitions: 1,
      replicationFactor: 1
    }));
    
    await admin.createTopics({
      topics,
      waitForLeaders: true
    });
    
    console.log('Topics created successfully');
  } catch (error) {
    console.error('Error setting up Kafka topics:', error);
  } finally {
    await admin.disconnect();
    console.log('Disconnected from Kafka');
  }
}

setupKafkaTopics().catch(console.error);