import 'dotenv/config';
import { createApp } from './src/app.js';
import { initializeDatabase } from './src/db/database.js';

const PORT = process.env.PORT || 3000;

initializeDatabase()
  .then(() => {
    const app = createApp();

    app.listen(PORT, () => {
      console.log(`AI chat backend is running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(`Failed to initialize backend storage: ${error.message}`);
    process.exit(1);
  });
