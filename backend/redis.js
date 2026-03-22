import { createClient } from 'redis';

export const redis = createClient({
	url: "redis://notes-redis:6379"
});

await redis.connect();
