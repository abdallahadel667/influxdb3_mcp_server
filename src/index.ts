#!/usr/bin/env node

import { validateConfig } from './config/index.js';
import { CLIInterface } from './cli/interface.js';

async function main() {
  try {
    // Validate configuration
    validateConfig();
    
    // Start the CLI interface
    const cli = new CLIInterface();
    await cli.start();
  } catch (error) {
    console.error('❌ Failed to start InfluxDB Agent:', error);
    
    if (error instanceof Error && error.message.includes('GOOGLE_API_KEY')) {
      console.log('\n💡 Setup Instructions:');
      console.log('1. Get a Google AI API key from: https://makersuite.google.com/app/apikey');
      console.log('2. Copy .env.example to .env');
      console.log('3. Add your API key and InfluxDB configuration to .env');
      console.log('4. Make sure your InfluxDB MCP server is properly configured');
    }
    
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

main();