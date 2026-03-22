import express from "express";
import 'dotenv/config';
import cors from 'cors';
import { connection } from "./backend.js";
import multer from "multer";
import { redis } from './redis.js';
import config from "./config.js";

const app = express();
const upload = multer();

app.use(cors());

app.get("/", (req, res) => {
  res.json({ connection: "ok" });
});


app.get("/api", async (req, res) => {
	try {
		const cacheKey = "todos";
		const cached = await redis.get(cacheKey);
		if (cached) {
			return res.json(JSON.parse(cached));
		}


		const [rows] = await connection.execute(
			"SELECT * FROM notes"
		);
		
		await redis.set(config.redis.todosCache, JSON.stringify({notes: rows}), {
			EX: 300
		});

		res.status(200).json({notes: rows});

	} catch (error) {
		console.log(error);
	}
})
app.post("/api", upload.none(), async (req, res) => {
  try {
    const { title } = req.body;

    await connection.execute(
      "INSERT INTO notes(title) VALUES (?)",
      [title]
    );

    await redis.del(config.redis.todosCache);

    res.status(200).json({ message: "inserted" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "db error" });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(4000, "0.0.0.0", () => {
    console.log("server is running on port 4000");
  });
}

export { app, connection, redis };
