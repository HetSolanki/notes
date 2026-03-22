import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';

// Mock dependencies before importing app
const mockExecute = jest.fn();
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();

jest.unstable_mockModule('./backend.js', () => ({
  connection: {
    execute: mockExecute,
    end: jest.fn()
  }
}));

jest.unstable_mockModule('./redis.js', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    quit: jest.fn()
  }
}));

// Import app after mocks are set up
const { app } = await import('./insert.js');

describe('Notes API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    it('should return connection ok', async () => {
      const res = await request(app).get('/');
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ connection: 'ok' });
    });
  });

  describe('GET /api', () => {
    it('should return cached notes on cache hit', async () => {
      const cachedNotes = { notes: [{ id: 1, title: 'cached note' }] };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedNotes));

      const res = await request(app).get('/api');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(cachedNotes);
      expect(mockRedisGet).toHaveBeenCalledWith('todos');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should fetch from database on cache miss', async () => {
      const dbNotes = [{ id: 1, title: 'db note' }];
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValue([dbNotes]);
      mockRedisSet.mockResolvedValue('OK');

      const res = await request(app).get('/api');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ notes: dbNotes });
      expect(mockExecute).toHaveBeenCalledWith('SELECT * FROM notes');
      expect(mockRedisSet).toHaveBeenCalledWith(
        'todos',
        JSON.stringify({ notes: dbNotes }),
        { EX: 300 }
      );
    });

    it('should return empty array when no notes exist', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockExecute.mockResolvedValue([[]]);
      mockRedisSet.mockResolvedValue('OK');

      const res = await request(app).get('/api');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ notes: [] });
    });
  });

  describe('POST /api', () => {
    it('should insert a new note', async () => {
      mockExecute.mockResolvedValue([{ insertId: 1 }]);
      mockRedisDel.mockResolvedValue(1);

      const res = await request(app)
        .post('/api')
        .field('title', 'Test Note');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'inserted' });
      expect(mockExecute).toHaveBeenCalledWith(
        'INSERT INTO notes(title) VALUES (?)',
        ['Test Note']
      );
      expect(mockRedisDel).toHaveBeenCalledWith('todos');
    });

    it('should invalidate cache after inserting', async () => {
      mockExecute.mockResolvedValue([{ insertId: 2 }]);
      mockRedisDel.mockResolvedValue(1);

      await request(app)
        .post('/api')
        .field('title', 'Another Note');

      expect(mockRedisDel).toHaveBeenCalledWith('todos');
    });

    it('should return 500 on database error', async () => {
      mockExecute.mockRejectedValue(new Error('DB connection failed'));
      const res = await request(app)
       .post('/api')
       .field('title', 'Fail Note');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'db error' });
    });
});
});
