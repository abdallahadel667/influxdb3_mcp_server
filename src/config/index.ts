import dotenv from 'dotenv';

dotenv.config();

export const config = {
  google: {
    apiKey: process.env.GOOGLE_API_KEY || '',
  },
  mcp: {
    serverCommand: process.env.MCP_SERVER_COMMAND || 'node',
    serverArgs: process.env.MCP_SERVER_ARGS?.split(' ') || [],
  },
  influxdb: {
    instanceUrl: process.env.INFLUX_DB_INSTANCE_URL || 'http://localhost:8181/',
    token: process.env.INFLUX_DB_TOKEN || '',
    productType: process.env.INFLUX_DB_PRODUCT_TYPE || 'core',
  },
  agent: {
    maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '10'),
    temperature: parseFloat(process.env.AGENT_TEMPERATURE || '0.1'),
    enableMemory: process.env.ENABLE_MEMORY === 'true',
    memorySize: parseInt(process.env.MEMORY_SIZE || '50'),
  },
};

export function validateConfig() {
  const errors: string[] = [];

  if (!config.google.apiKey) {
    errors.push('GOOGLE_API_KEY is required');
  }

  if (!config.influxdb.token) {
    errors.push('INFLUX_DB_TOKEN is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}