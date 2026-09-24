const winston = require('winston');
const morgan = require('morgan');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

const morganMiddleware = morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
});

module.exports = { logger, morganMiddleware };
