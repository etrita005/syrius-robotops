import { serve } from '@hono/node-server';
import app from './server.js';

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`MemStore server running at http://localhost:${info.port}`);
});
