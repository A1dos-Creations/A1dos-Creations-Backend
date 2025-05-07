// backend/db.js
// Handles PostgreSQL database connection using pooling.
const { Pool } = require('pg');

// Configure the connection pool.
// It will automatically use environment variables if they exist:
// PGUSER, PGHOST, PGDATABASE, PGPASSWORD, PGPORT
// Render provides DATABASE_URL, which pg uses automatically.
const pool = new Pool({
    // Use DATABASE_URL from environment variables (provided by Render)
    connectionString: process.env.DATABASE_URL,
    // Add SSL configuration if required by your database provider (Render usually needs it)
    // The 'pg' library enables SSL automatically if DATABASE_URL includes sslmode=require
    // Explicitly setting it might be needed in some cases:
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    // Optional: Configure pool size, timeouts, etc.
    // max: 20, // Max number of clients in the pool
    // idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    // connectionTimeoutMillis: 2000, // How long to wait for a connection attempt to succeed
});

pool.on('connect', () => {
    console.log('Database pool connected');
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle database client', err);
    // You might want to exit the process or implement retry logic here
    // process.exit(-1);
});

console.log(`Database connection string source: ${process.env.DATABASE_URL ? 'DATABASE_URL environment variable' : 'Default pg environment variables'}`);
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require')) {
     console.log('SSL requirement for database connection: Enabled via connection string.');
} else {
    console.log(`SSL requirement for database connection (explicit): ${pool.options.ssl ? 'Enabled' : 'Disabled'}`);
}


module.exports = {
    // Function to execute queries using a client from the pool
    query: (text, params) => pool.query(text, params),
    // Function to get a client for transactions (if needed later)
    // getClient: () => pool.connect(),
};