import { createClient } from 'redis';

const isTestMode = process.env.NODE_ENV === 'test';
const redisUrl = isTestMode ? process.env.TEST_REDIS_URL : process.env.NOTES_REDIS_URL;

export const redis = createClient({
	url: redisUrl || "redis://redis:6379"
});

await redis.connect();
