// Required dependencies
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const { Kafka } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const path = require('path');

// Environment variables with defaults
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_app';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const KAFKA_BROKERS = process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['kafka:29092'];
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key';
const PORT = process.env.PORT || 3000;
const TOPIC_PREFIX = process.env.TOPIC_PREFIX || 'chat_room_';
const KAFKA_CONNECTION_TIMEOUT = parseInt(process.env.KAFKA_CONNECTION_TIMEOUT || '60000', 10);

// Log configuration
console.log('Starting server with configuration:');
console.log(`- Kafka Brokers: ${KAFKA_BROKERS}`);
console.log(`- MongoDB URI: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Hide credentials
console.log(`- Redis Host: ${REDIS_HOST}`);
console.log(`- Redis Port: ${REDIS_PORT}`);
console.log(`- Topic Prefix: ${TOPIC_PREFIX}`);
console.log(`- Port: ${PORT}`);

// Express setup
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);

// WebSocket setup
const wss = new WebSocket.Server({ server, path: '/ws' });

// Redis client
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT
});
// MongoDB connection
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('Failed to connect to MongoDB', err);
  process.exit(1);
});

// Define MongoDB schemas and models
const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, index: true },
  type: { type: String, required: true },
  roomId: { type: String, required: true, index: true },
  content: { type: String, required: true },
  userId: String,
  username: String,
  timestamp: { type: Number, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

const roomSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  created: { type: Number, required: true },
  createdBy: String
});

const Message = mongoose.model('Message', messageSchema);
const Room = mongoose.model('Room', roomSchema);

// Kafka setup
const kafka = new Kafka({ 
  clientId: 'chat-app', 
  brokers: KAFKA_BROKERS,
  // Add retry configuration
  retry: {
    initialRetryTime: 1000,
    retries: 10,
    maxRetryTime: 30000,
    factor: 2
  },
  // Add socket configuration
  socketOpts: {
    connectionTimeout: KAFKA_CONNECTION_TIMEOUT,
    keepAlive: true
  }
});
const producer = kafka.producer({
  allowAutoTopicCreation: true,
  transactionTimeout: 30000
});

// Create a dedicated consumer for permanent storage
const storageConsumer = kafka.consumer({ 
  groupId: 'chat-storage-group',
  // Add consumer-specific retry configuration
  retry: {
    initialRetryTime: 1000,
    retries: 10,
    maxRetryTime: 30000,
    factor: 2
  },
  // Set a longer session timeout to give more time for rebalancing
  sessionTimeout: 45000,
  // Allow rebalancing immediately
  rebalanceTimeout: 10000,
  // Add heartbeat interval
  heartbeatInterval: 3000
});

// Constants
const SECRET = JWT_SECRET;
const DEFAULT_ROOMS = ['general', 'random', 'tech'];
const MAX_MESSAGES_PER_ROOM = 50;

// Track WebSocket clients and their rooms
const clients = new Map();

// User registry - in production, use a database
const users = new Map([
  ['user1', { password: 'pass1', name: 'Alice' }],
  ['user2', { password: 'pass2', name: 'Bob' }],
  ['user3', { password: 'pass3', name: 'Charlie' }]
]);

// ==================== AUTH ENDPOINTS ====================

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const user = users.get(username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign(
    { id: username, name: user.name }, 
    SECRET, 
    { expiresIn: '1h' }
  );
  
  res.json({ token, user: { id: username, name: user.name } });
});

// Logout endpoint
app.post('/api/logout', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.sendStatus(401);
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET);
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    await redis.set(`blacklist:${token}`, '1', 'EX', ttl);
    res.json({ message: 'Logged out and token blacklisted' });
  } catch (err) {
    res.status(400).json({ error: 'Invalid token' });
  }
});

// Auth middleware
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  
  const token = authHeader.split(' ')[1];
  if (await redis.get(`blacklist:${token}`)) {
    return res.status(401).json({ error: 'Token is blacklisted' });
  }
  
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ==================== ROOM ENDPOINTS ====================

// Initialize default rooms
async function initializeDefaultRooms() {
  for (const room of DEFAULT_ROOMS) {
    const exists = await redis.exists(`room:${room}`);
    if (!exists) {
      await redis.hmset(`room:${room}`, {
        id: room,
        name: room.charAt(0).toUpperCase() + room.slice(1),
        created: Date.now()
      });
      await redis.sadd('rooms', room);
    }
  }
}

// List all rooms
app.get('/api/rooms', authenticate, async (req, res) => {
  const roomIds = await redis.smembers('rooms');
  const rooms = [];
  
  for (const id of roomIds) {
    const roomData = await redis.hgetall(`room:${id}`);
    if (roomData && Object.keys(roomData).length > 0) {
      rooms.push(roomData);
    }
  }

  res.json(rooms);
});

// Get room details
app.get('/api/rooms/:roomId', authenticate, async (req, res) => {
  const { roomId } = req.params;
  const roomExists = await redis.sismember('rooms', roomId);
  
  if (!roomExists) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  const roomData = await redis.hgetall(`room:${roomId}`);
  res.json(roomData);
});

// Create a new room
app.post('/api/rooms', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Room name is required' });
  }
  
  // Generate a room ID based on a slugified version of the name
  const roomId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  
  // Check if room already exists
  const roomExists = await redis.sismember('rooms', roomId);
  if (roomExists) {
    return res.status(409).json({ error: 'Room already exists' });
  }
  
  // Create the room in Redis
  const roomData = {
    id: roomId,
    name,
    created: Date.now(),
    createdBy: req.user.id
  };
  
  await redis.hmset(`room:${roomId}`, roomData);
  await redis.sadd('rooms', roomId);
  
  res.status(201).json(roomData);
});

// Get chat history for a room with pagination and seamless Redis/MongoDB integration
app.get('/api/rooms/:roomId/messages', authenticate, async (req, res) => {
  const { roomId } = req.params;
  const { limit = MAX_MESSAGES_PER_ROOM, before, after, source } = req.query;
  
  // Check if room exists
  const roomExists = await redis.sismember('rooms', roomId);
  if (!roomExists) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  // Parse numeric parameters
  const parsedLimit = Math.min(parseInt(limit) || MAX_MESSAGES_PER_ROOM, 100); // Limit to 100 max
  const parsedBefore = before ? parseInt(before) : null;
  const parsedAfter = after ? parseInt(after) : null;
  
  try {
    let messages = [];
    
    // Case 1: User explicitly wants only recent messages from Redis
    if (source === 'redis') {
      const redisMessages = await redis.lrange(`chat-history:${roomId}`, 0, parsedLimit - 1);
      messages = redisMessages.map(msg => JSON.parse(msg));
      
      // Add source information and sort
      messages = messages.map(msg => ({ ...msg, source: 'redis' })).sort((a, b) => b.timestamp - a.timestamp);
    }
    
    // Case 2: User explicitly wants only archived messages from MongoDB
    else if (source === 'mongodb') {
      const query = { roomId };
      if (parsedBefore) query.timestamp = { $lt: parsedBefore };
      if (parsedAfter) query.timestamp = { ...(query.timestamp || {}), $gt: parsedAfter };
      
      messages = await Message.find(query)
        .sort({ timestamp: -1 })
        .limit(parsedLimit)
        .lean();
        
      // Add source information
      messages = messages.map(msg => ({ ...msg, source: 'mongodb' }));
    }
    
    // Case 3: Default - Smart combined approach (most recent first)
    else {
      // First, get the most recent messages from Redis
      const redisMessages = await redis.lrange(`chat-history:${roomId}`, 0, parsedLimit - 1);
      const parsedRedisMessages = redisMessages.map(msg => JSON.parse(msg))
        .map(msg => ({ ...msg, source: 'redis' }));
      
      // If we have "before" parameter, prioritize MongoDB query
      if (parsedBefore) {
        const query = { roomId, timestamp: { $lt: parsedBefore } };
        messages = await Message.find(query)
          .sort({ timestamp: -1 })
          .limit(parsedLimit)
          .lean();
          
        messages = messages.map(msg => ({ ...msg, source: 'mongodb' }));
      } 
      // If we have all requested messages in Redis, return those
      else if (parsedRedisMessages.length >= parsedLimit) {
        messages = parsedRedisMessages.slice(0, parsedLimit);
      }
      // If we need more messages than Redis has, get the remainder from MongoDB
      else if (parsedRedisMessages.length > 0) {
        // Get the oldest message from Redis to establish the cutoff point
        const oldestRedisMessage = parsedRedisMessages[parsedRedisMessages.length - 1];
        
        // Find messages older than the oldest Redis message
        const olderMessages = await Message.find({
          roomId,
          timestamp: { $lt: oldestRedisMessage.timestamp }
        })
          .sort({ timestamp: -1 })
          .limit(parsedLimit - parsedRedisMessages.length)
          .lean();
          
        // Combine Redis and MongoDB results
        messages = [
          ...parsedRedisMessages,
          ...olderMessages.map(msg => ({ ...msg, source: 'mongodb' }))
        ];
      }
      // If Redis is empty, get all from MongoDB
      else {
        const query = { roomId };
        if (parsedAfter) query.timestamp = { $gt: parsedAfter };
        
        messages = await Message.find(query)
          .sort({ timestamp: -1 })
          .limit(parsedLimit)
          .lean();
          
        messages = messages.map(msg => ({ ...msg, source: 'mongodb' }));
      }
    }
    
    // Sort by timestamp (most recent first)
    messages.sort((a, b) => b.timestamp - a.timestamp);
    
    // Add pagination metadata
    const oldest = messages.length > 0 ? Math.min(...messages.map(m => m.timestamp)) : null;
    const newest = messages.length > 0 ? Math.max(...messages.map(m => m.timestamp)) : null;
    
    res.json({
      messages,
      pagination: {
        count: messages.length,
        hasMore: messages.length === parsedLimit,
        oldest,
        newest
      }
    });
  } catch (err) {
    console.error(`Error fetching messages for room ${roomId}:`, err);
    res.status(500).json({ error: 'Failed to fetch message history' });
  }
});

// ==================== WEBSOCKET HANDLING ====================

// WebSocket authentication middleware
const wsAuthenticate = async (request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const token = url.searchParams.get('token');
  
  if (!token) {
    return null;
  }
  
  if (await redis.get(`blacklist:${token}`)) {
    return null;
  }
  
  try {
    return jwt.verify(token, SECRET);
  } catch (err) {
    return null;
  }
};

// Keep track of room listeners and consumers
const roomConsumers = new Map();

// Function to get or create shared room consumer
async function getOrCreateRoomConsumer(roomId) {
  if (!roomConsumers.has(roomId)) {
    console.log(`Creating shared consumer for room: ${roomId}`);
    
    // Create a new shared consumer for this room
    const groupId = `chat-room-group-${roomId}`;
    const consumer = kafka.consumer({ groupId });
    
    await consumer.connect();
    await consumer.subscribe({ topic: `${TOPIC_PREFIX}${roomId}`, fromBeginning: false });
    
    // Track subscribers to this room
    const subscribers = new Set();
    
    // Start consuming messages
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const parsedMessage = JSON.parse(message.value.toString());
        
        // Broadcast to all subscribers of this room
        for (const clientId of subscribers) {
          sendToClient(clientId, parsedMessage);
        }
      }
    });
    
    // Store the consumer and subscribers
    roomConsumers.set(roomId, { consumer, subscribers });
  }
  
  return roomConsumers.get(roomId);
}

// Handle WebSocket connections
wss.on('connection', async (ws, req) => {
  // Authenticate the connection
  const user = await wsAuthenticate(req);
  if (!user) {
    ws.close(4001, 'Authentication failed');
    return;
  }
  
  // Store client information
  const clientId = uuidv4();
  clients.set(clientId, {
    ws,
    user,
    rooms: new Set()
  });
  
  // Initialize lastPong time
  clients.get(clientId).lastPong = Date.now();
  
  // Set ping/pong for detecting disconnections
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      // Check if client hasn't responded for too long
      const client = clients.get(clientId);
      if (client && client.lastPong) {
        const timeSinceLastPong = Date.now() - client.lastPong;
        if (timeSinceLastPong > 60000) { // 60 seconds timeout
          console.log(`Client ${clientId} timed out (no pong for ${timeSinceLastPong}ms)`);
          ws.terminate(); // Force close the connection
          return;
        }
      }
      
      // Send ping
      ws.ping();
    }
  }, 30000); // 30 seconds
  
  ws.on('pong', () => {
    // Client is still connected
    const client = clients.get(clientId);
    if (client) {
      client.lastPong = Date.now();
    }
  });
  
  // Handle client messages
  ws.on('message', async (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      
      // Handle different message types
      switch (parsedMessage.type) {
        case 'join':
          await handleJoinRoom(clientId, user, parsedMessage.roomId);
          break;
          
        case 'leave':
          await handleLeaveRoom(clientId, parsedMessage.roomId);
          break;
          
        case 'message':
          await handleChatMessage(clientId, user, parsedMessage.roomId, parsedMessage.content);
          break;
          
        default:
          sendToClient(clientId, {
            type: 'error',
            content: 'Unknown message type'
          });
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
      sendToClient(clientId, {
        type: 'error',
        content: 'Invalid message format'
      });
    }
  });
  
  // Handle disconnection
  ws.on('close', async () => {
    clearInterval(pingInterval);
    
    const client = clients.get(clientId);
    if (client) {
      console.log(`Client ${clientId} (${client.user.name}) disconnected`);
      
      // Leave all rooms
      const roomsToLeave = [...client.rooms]; // Create a copy to avoid modification during iteration
      for (const roomId of roomsToLeave) {
        try {
          await handleLeaveRoom(clientId, roomId);
        } catch (err) {
          console.error(`Error leaving room ${roomId} for client ${clientId}:`, err);
        }
      }
      
      // Remove client from the map
      clients.delete(clientId);
    }
  });
  
  // Handle unexpected errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    ws.close(1011, 'Internal server error');
  });
  
  // Send welcome message
  sendToClient(clientId, {
    type: 'system',
    content: `Welcome, ${user.name}!`
  });
});

// Join a room
async function handleJoinRoom(clientId, user, roomId) {
  const client = clients.get(clientId);
  if (!client) return;
  
  // Check if room exists
  const roomExists = await redis.sismember('rooms', roomId);
  if (!roomExists) {
    return sendToClient(clientId, {
      type: 'error',
      content: 'Room not found'
    });
  }
  
  // Check if client is already in this room
  if (client.rooms.has(roomId)) {
    return sendToClient(clientId, {
      type: 'error',
      content: 'You are already in this room'
    });
  }
  
  // Get or create shared room consumer
  const { subscribers } = await getOrCreateRoomConsumer(roomId);
  
  // Add client to subscribers for this room
  subscribers.add(clientId);
  
  // Add room to client's subscriptions
  client.rooms.add(roomId);
  
  // Send room history from Redis (recent messages)
  const recentMessages = await redis.lrange(`chat-history:${roomId}`, 0, MAX_MESSAGES_PER_ROOM - 1);
  const parsedRecentMessages = recentMessages.map(msg => JSON.parse(msg));
  
  sendToClient(clientId, {
    type: 'history',
    roomId,
    messages: parsedRecentMessages.reverse(),
    source: 'recent'
  });
  
  // Also fetch older messages from MongoDB (if needed)
  if (recentMessages.length < MAX_MESSAGES_PER_ROOM) {
    try {
      // Get oldest message timestamp from Redis
      let oldestTimestamp = Infinity;
      if (recentMessages.length > 0) {
        const oldestMessage = JSON.parse(recentMessages[recentMessages.length - 1]);
        oldestTimestamp = oldestMessage.timestamp;
      }
      
      // Fetch older messages from MongoDB
      const olderMessages = await Message.find({
        roomId,
        timestamp: { $lt: oldestTimestamp }
      })
      .sort({ timestamp: -1 })
      .limit(MAX_MESSAGES_PER_ROOM - recentMessages.length)
      .lean();
      
      if (olderMessages.length > 0) {
        sendToClient(clientId, {
          type: 'history',
          roomId,
          messages: olderMessages,
          source: 'archive'
        });
      }
    } catch (err) {
      console.error(`Error fetching archived messages for room ${roomId}:`, err);
    }
  }
  
  // Notify room about new user
  const joinMessage = {
    type: 'system',
    roomId,
    content: `${user.name} has joined the room`,
    timestamp: Date.now(),
    id: uuidv4()
  };
  
  await producer.send({
    topic: `${TOPIC_PREFIX}${roomId}`,
    messages: [{ value: JSON.stringify(joinMessage) }]
  });
  
  console.log(`User ${user.name} (${clientId}) joined room ${roomId}`);
}

// Leave a room
async function handleLeaveRoom(clientId, roomId) {
  const client = clients.get(clientId);
  if (!client || !client.rooms.has(roomId)) return;
  
  try {
    // Remove room from client's subscriptions
    client.rooms.delete(roomId);
    
    // Remove client from room subscribers
    const roomConsumerData = roomConsumers.get(roomId);
    if (roomConsumerData) {
      roomConsumerData.subscribers.delete(clientId);
      
      // If no more subscribers, clean up the consumer
      if (roomConsumerData.subscribers.size === 0) {
        console.log(`No more subscribers for room ${roomId}, cleaning up consumer`);
        try {
          await roomConsumerData.consumer.disconnect();
        } catch (err) {
          console.error(`Error disconnecting consumer for room ${roomId}:`, err);
        }
        roomConsumers.delete(roomId);
      }
    }
    
    // Notify room about user leaving
    const leaveMessage = {
      type: 'system',
      roomId,
      content: `${client.user.name} has left the room`,
      timestamp: Date.now(),
      id: uuidv4()
    };
    
    await producer.send({
      topic: `${TOPIC_PREFIX}${roomId}`,
      messages: [{ value: JSON.stringify(leaveMessage) }]
    });
    
    console.log(`User ${client.user.name} (${clientId}) left room ${roomId}`);
  } catch (err) {
    console.error(`Error in handleLeaveRoom for client ${clientId}, room ${roomId}:`, err);
    // Still remove room from client's subscriptions even if other operations fail
    if (client && client.rooms.has(roomId)) {
      client.rooms.delete(roomId);
    }
  }
}

// Handle chat message
async function handleChatMessage(clientId, user, roomId, content) {
  const client = clients.get(clientId);
  if (!client || !client.rooms.has(roomId)) {
    return sendToClient(clientId, {
      type: 'error',
      content: 'You are not in this room'
    });
  }
  
  // Validate content
  if (!content || typeof content !== 'string' || content.trim() === '') {
    return sendToClient(clientId, {
      type: 'error',
      content: 'Message cannot be empty'
    });
  }
  
  // Create message object
  const message = {
    type: 'message',
    roomId,
    content,
    userId: user.id,
    username: user.name,
    timestamp: Date.now(),
    id: uuidv4()
  };
  
  try {
    // Send to Kafka topic
    await producer.send({
      topic: `${TOPIC_PREFIX}${roomId}`,
      messages: [{ value: JSON.stringify(message) }]
    });
    
    // Store in Redis (recent history)
    await redis.lpush(`chat-history:${roomId}`, JSON.stringify(message));
    await redis.ltrim(`chat-history:${roomId}`, 0, MAX_MESSAGES_PER_ROOM - 1);
    
    // For monitoring
    console.log(`Message from ${user.name} in room ${roomId}: ${content.substring(0, 30)}${content.length > 30 ? '...' : ''}`);
  } catch (err) {
    console.error(`Error sending message to room ${roomId}:`, err);
    
    // Notify client of error
    sendToClient(clientId, {
      type: 'error',
      content: 'Failed to send message, please try again'
    });
  }
  
  // Note: We don't need to store in MongoDB here
  // The dedicated storage consumer will handle that
}

// Send message to client
function sendToClient(clientId, message) {
  const client = clients.get(clientId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

// ==================== PERMANENT STORAGE ====================

// Initialize the storage consumer
async function initializeStorageConsumer() {
  try {
    console.log('Connecting storage consumer to Kafka...');
    await storageConsumer.connect();
    
    // Get all rooms from Redis
    const roomIds = await redis.smembers('rooms');
    
    // Subscribe to all room topics
    for (const roomId of roomIds) {
      try {
        console.log(`Subscribing storage consumer to topic: ${TOPIC_PREFIX}${roomId}`);
        await storageConsumer.subscribe({ 
          topic: `${TOPIC_PREFIX}${roomId}`, 
          fromBeginning: false 
        });
        console.log(`Storage consumer subscribed to room: ${roomId}`);
      } catch (err) {
        console.error(`Failed to subscribe to ${TOPIC_PREFIX}${roomId}:`, err);
        // Continue with other topics even if one fails
      }
    }
    
    // Process messages and store in MongoDB
    await storageConsumer.run({
      autoCommit: true,
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const parsedMessage = JSON.parse(message.value.toString());
          const roomId = topic.slice(TOPIC_PREFIX.length);
          
          // Store message in MongoDB
          await Message.create({
            id: parsedMessage.id || uuidv4(),
            type: parsedMessage.type,
            roomId,
            content: parsedMessage.content,
            userId: parsedMessage.userId,
            username: parsedMessage.username,
            timestamp: parsedMessage.timestamp
          });
          
          console.log(`Stored message from room ${roomId} in MongoDB`);
        } catch (err) {
          console.error('Error storing message in MongoDB:', err);
        }
      }
    });
    
    console.log('Storage consumer initialized and running');
  } catch (err) {
    console.error('Failed to initialize storage consumer:', err);
    console.log('Retrying storage consumer initialization in 5 seconds...');
    // Retry after delay
    setTimeout(() => initializeStorageConsumer(), 5000);
  }
}

// Add an endpoint to query historical messages from MongoDB
app.get('/api/rooms/:roomId/history', authenticate, async (req, res) => {
  const { roomId } = req.params;
  const { limit = 100, before } = req.query;
  
  try {
    const query = { roomId };
    if (before) {
      query.timestamp = { $lt: parseInt(before) };
    }
    
    const messages = await Message.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();
    
    res.json(messages);
  } catch (err) {
    console.error('Error fetching message history:', err);
    res.status(500).json({ error: 'Failed to fetch message history' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now()
  };
  res.status(200).json(healthcheck);
});

// Sync Redis rooms with MongoDB on startup
async function syncRoomsWithMongoDB() {
  const roomIds = await redis.smembers('rooms');
  
  for (const roomId of roomIds) {
    const roomData = await redis.hgetall(`room:${roomId}`);
    
    if (roomData && Object.keys(roomData).length > 0) {
      // Update or create room in MongoDB
      await Room.updateOne(
        { id: roomId },
        roomData,
        { upsert: true }
      );
    }
  }
  
  console.log('Rooms synced with MongoDB');
}

// Add a hook to sync new rooms with MongoDB
const originalCreateRoom = app.post.bind(app);
app.post = function(path, ...args) {
  if (path === '/api/rooms') {
    const originalHandler = args[args.length - 1];
    args[args.length - 1] = async (req, res) => {
      const result = await originalHandler(req, res);
      
      // After room is created, subscribe storage consumer
      if (res.statusCode === 201) {
        const roomId = result.id;
        await storageConsumer.subscribe({ topic: `${TOPIC_PREFIX}${roomId}`, fromBeginning: false });
        console.log(`Storage consumer subscribed to new room: ${roomId}`);
      }
      
      return result;
    };
  }
  
  return originalCreateRoom(path, ...args);
};

// ==================== SERVER STARTUP ====================

// Start server and initialize Kafka/Redis/MongoDB
(async () => {
  try {
    // Connect to Kafka with retry logic
    console.log('Connecting producer to Kafka...');
    let producerConnected = false;
    let producerRetries = 0;
    const maxProducerRetries = 5;
    
    while (!producerConnected && producerRetries < maxProducerRetries) {
      try {
        await producer.connect();
        producerConnected = true;
        console.log('Producer connected to Kafka successfully');
      } catch (err) {
        producerRetries++;
        console.error(`Failed to connect producer to Kafka (attempt ${producerRetries}/${maxProducerRetries}):`, err);
        
        if (producerRetries < maxProducerRetries) {
          const retryDelay = Math.min(1000 * Math.pow(2, producerRetries), 30000);
          console.log(`Retrying producer connection in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          throw new Error('Max producer connection retries exceeded');
        }
      }
    }
    
    // Initialize default rooms
    await initializeDefaultRooms();
    
    // Sync rooms with MongoDB
    await syncRoomsWithMongoDB();
    
    // Ensure Kafka topics exist for all rooms
    await ensureKafkaTopicsExist();
    
    // Start the storage consumer
    await initializeStorageConsumer();
    
    // Start server
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();

// Ensure Kafka topics exist for all rooms
async function ensureKafkaTopicsExist() {
  try {
    console.log('Ensuring Kafka topics exist for all rooms...');
    
    // Create admin client
    const admin = kafka.admin();
    await admin.connect();
    
    // Get all rooms from Redis
    const roomIds = await redis.smembers('rooms');
    
    // Create array of topic names
    const topics = roomIds.map(roomId => `${TOPIC_PREFIX}${roomId}`);
    
    // Get list of existing topics
    const existingTopics = await admin.listTopics();
    console.log('Existing Kafka topics:', existingTopics);
    
    // Create topics that don't exist yet
    const topicsToCreate = topics.filter(topic => !existingTopics.includes(topic));
    
    if (topicsToCreate.length > 0) {
      console.log(`Creating ${topicsToCreate.length} Kafka topics:`, topicsToCreate);
      
      await admin.createTopics({
        topics: topicsToCreate.map(topic => ({
          topic,
          numPartitions: 1,        // Adjust as needed
          replicationFactor: 1     // Adjust as needed
        })),
        waitForLeaders: true,
        timeout: 10000
      });
      
      console.log('Successfully created Kafka topics');
    } else {
      console.log('All required Kafka topics already exist');
    }
    
    await admin.disconnect();
  } catch (err) {
    console.error('Error ensuring Kafka topics exist:', err);
    console.log('Will attempt to continue regardless...');
  }
}