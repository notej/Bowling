
const { db } = require('./database');

console.log('Initializing database...');

// Wait a bit for tables to be created
db.serialize(() => {
    db.run('SELECT 1', (err) => {
        if (err) {
            console.error('Database init failed:', err);
            process.exit(1);
        }
        console.log('Database initialized successfully!');
        db.close();
    });
});
