import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import mysql from 'mysql2/promise';
import { createClient } from 'redis';
import { app } from './insert.js';

// Integration test with real databases
describe('Notes API Integration Tests', () => {
  let testConnection;
  let testRedis;

  beforeAll(async () => {
    // Setup test database connection
    testConnection = await mysql.createConnection({
      host: process.env.TEST_DB_HOST || 'localhost',
      port: process.env.TEST_DB_PORT || 3306,
      user: process.env.TEST_DB_USERNAME || 'root',
      password: process.env.TEST_DB_PASSWORD || 'root',
      database: process.env.TEST_DB_DATABASE || 'test_notes'
    });

    // Setup test Redis connection
    testRedis = createClient({
      url: process.env.TEST_REDIS_URL || 'redis://localhost:6379'
    });
    await testRedis.connect();

    // Create test table
    await testConnection.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        title VARCHAR(255)
      )
    `);
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await testConnection.execute('DELETE FROM notes');
    await testRedis.flushDb();
  });

  afterAll(async () => {
    // Clean up connections
    await testConnection.end();
    await testRedis.quit();
  });

  describe('GET /', () => {
    it('should return connection ok', async () => {
      const res = await request(app).get('/');
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ connection: 'ok' });
    });
  });

  describe('GET /api', () => {
    it('should return empty notes array when no notes exist', async () => {
      const res = await request(app).get('/api');
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ notes: [] });
    });

    it('should return notes from database', async () => {
      // Insert test data directly into database
      await testConnection.execute(
        'INSERT INTO notes (title) VALUES (?)', 
        ['Integration Test Note']
      );

      const res = await request(app).get('/api');
      
      expect(res.status).toBe(200);
      expect(res.body.notes).toHaveLength(1);
      expect(res.body.notes[0].title).toBe('Integration Test Note');
    });

    it('should cache notes in Redis after first request', async () => {
      // Insert test data
      await testConnection.execute(
        'INSERT INTO notes (title) VALUES (?)', 
        ['Cached Note']
      );

      // First request should populate cache
      await request(app).get('/api');
      
      // Check cache exists
      const cached = await testRedis.get('todos');
      expect(cached).toBeTruthy();
      
      const cachedData = JSON.parse(cached);
      expect(cachedData.notes).toHaveLength(1);
      expect(cachedData.notes[0].title).toBe('Cached Note');
    });

    it('should serve from cache on second request', async () => {
      // Insert test data
      await testConnection.execute(
        'INSERT INTO notes (title) VALUES (?)', 
        ['Test Note']
      );

      // First request
      const res1 = await request(app).get('/api');
      expect(res1.status).toBe(200);

      // Delete from database to verify cache is used
      await testConnection.execute('DELETE FROM notes');

      // Second request should still return the cached note
      const res2 = await request(app).get('/api');
      expect(res2.status).toBe(200);
      expect(res2.body.notes).toHaveLength(1);
      expect(res2.body.notes[0].title).toBe('Test Note');
    });
  });

  describe('POST /api', () => {
    it('should create a new note', async () => {
      const res = await request(app)
        .post('/api')
        .field('title', 'New Integration Test Note');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'inserted' });

      // Verify note was inserted in database
      const [rows] = await testConnection.execute('SELECT * FROM notes');
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('New Integration Test Note');
    });

    it('should invalidate cache after creating note', async () => {
      // Pre-populate cache
      await request(app).get('/api');
      
      // Verify cache exists
      let cached = await testRedis.get('todos');
      expect(cached).toBeTruthy();

      // Create new note
      await request(app)
        .post('/api')
        .field('title', 'Cache Invalidation Test');

      // Verify cache was cleared
      cached = await testRedis.get('todos');
      expect(cached).toBeNull();
    });

    it('should handle multiple notes creation', async () => {
      const notes = ['Note 1', 'Note 2', 'Note 3'];
      
      for (const note of notes) {
        const res = await request(app)
          .post('/api')
          .field('title', note);
        
        expect(res.status).toBe(200);
      }

      // Verify all notes were created
      const [rows] = await testConnection.execute('SELECT * FROM notes');
      expect(rows).toHaveLength(3);
      notes.forEach((note, index) => {
        expect(rows[index].title).toBe(note);
      });
    });

    it('should return fresh data after cache invalidation', async () => {
      // Create first note
      await request(app)
        .post('/api')
        .field('title', 'First Note');

      // Get notes (populates cache)
      const res1 = await request(app).get('/api');
      expect(res1.body.notes).toHaveLength(1);

      // Create second note (invalidates cache)
      await request(app)
        .post('/api')
        .field('title', 'Second Note');

      // Get notes again (should fetch fresh data)
      const res2 = await request(app).get('/api');
      expect(res2.body.notes).toHaveLength(2);
      expect(res2.body.notes.some(note => note.title === 'First Note')).toBe(true);
      expect(res2.body.notes.some(note => note.title === 'Second Note')).toBe(true);
    });
  });

  describe('Full workflow integration', () => {
    it('should handle complete CRUD workflow', async () => {
      // 1. Start with empty state
      let res = await request(app).get('/api');
      expect(res.body.notes).toHaveLength(0);

      // 2. Create multiple notes
      const noteTexts = ['First Note', 'Second Note', 'Third Note'];
      for (const text of noteTexts) {
        const createRes = await request(app)
          .post('/api')
          .field('title', text);
        expect(createRes.status).toBe(200);
      }

      // 3. Fetch all notes
      res = await request(app).get('/api');
      expect(res.body.notes).toHaveLength(3);
      
      // 4. Verify cache is working
      const cached = await testRedis.get('todos');
      expect(cached).toBeTruthy();
      const cachedData = JSON.parse(cached);
      expect(cachedData.notes).toHaveLength(3);

      // 5. Add one more note
      const finalCreateRes = await request(app)
        .post('/api')
        .field('title', 'Fourth Note');
      expect(finalCreateRes.status).toBe(200);

      // 6. Verify final state
      res = await request(app).get('/api');
      expect(res.body.notes).toHaveLength(4);
    });
  });
});
