const db = require('server.js');  // Import your Knex config

db.raw('SELECT 1+1 AS result')
  .then(() => console.log('✅ Database connected successfully!'))
  .catch(err => console.error('❌ Database connection failed:', err));
