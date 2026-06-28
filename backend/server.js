import 'dotenv/config';
import { createApp } from './src/app.js';
import { migrateLegacyConversations } from './src/services/conversationService.js';

const PORT = process.env.PORT || 3000;

migrateLegacyConversations()
  .then(() => {
    const app = createApp();

    app.listen(PORT, () => {
      console.log(`AI chat backend is running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(`Failed to migrate legacy conversations: ${error.message}`);
    process.exit(1);
  });
