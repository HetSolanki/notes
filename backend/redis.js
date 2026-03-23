import { createClient } from 'redis';

export const redis = createClient({
	url: process.env.NOTES_REDIS_URL || "redis://redis:6379"
});

await redis.connect();
