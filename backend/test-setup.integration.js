import 'dotenv/config';

// Load test environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

console.log('🧪 Integration test environment loaded');
console.log('Database:', process.env.TEST_DB_HOST, process.env.TEST_DB_DATABASE);
console.log('Redis:', process.env.TEST_REDIS_URL);