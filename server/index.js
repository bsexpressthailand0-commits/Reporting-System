import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database/init.js';
import { firestoreCompatRouter } from './routes/firestoreCompat.js';
import { apiRouter } from './routes/api.js';

initDatabase();
const app = express();
const port = Number(process.env.PORT || 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use('/api', apiRouter);
app.use('/api/firestore', firestoreCompatRouter);

const dist = path.resolve(__dirname, '../dist');
app.use(express.static(dist));
app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || 'Internal server error' });
});

app.listen(port, '0.0.0.0', () => console.log(`BS Express server running on http://0.0.0.0:${port}`));
