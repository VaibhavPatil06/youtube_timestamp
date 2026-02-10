import logger from '../utils/logger.js';

// Queues removed - using direct function calls instead
// All processing now happens asynchronously via services

logger.info('Queue system disabled - using direct function calls');
console.log('✅ Using direct async function calls instead of Redis queues');
console.log('✅ No Redis dependency required');

