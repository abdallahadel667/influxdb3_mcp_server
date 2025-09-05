import readline from 'readline';
import { InfluxDBAgent } from '../agent/graph.js';
import { McpClient } from '../mcp/client.js';

export class CLIInterface {
  private rl: readline.Interface;
  private agent: InfluxDBAgent;
  private mcpClient: McpClient;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '🔍 InfluxDB Query> ',
    });

    this.mcpClient = new McpClient();
    this.agent = new InfluxDBAgent(this.mcpClient);
  }

  async start(): Promise<void> {
    console.log('🚀 Starting InfluxDB Agent...');
    
    try {
      await this.mcpClient.connect();
      console.log('✅ Connected to InfluxDB MCP Server');
      
      this.showWelcome();
      this.setupEventHandlers();
      this.rl.prompt();
    } catch (error) {
      console.error('❌ Failed to start agent:', error);
      process.exit(1);
    }
  }

  private showWelcome(): void {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    InfluxDB AI Agent                         ║
║                                                              ║
║  I can help you interact with your InfluxDB database using  ║
║  natural language queries. Here are some examples:          ║
║                                                              ║
║  • "Show me all databases"                                   ║
║  • "Query the last 10 records from temperature data"        ║
║  • "What measurements are in the sensors database?"         ║
║  • "Check the health of my InfluxDB instance"               ║
║  • "Help me write data to the metrics database"             ║
║                                                              ║
║  Type 'help' for more information or 'quit' to exit.        ║
╚══════════════════════════════════════════════════════════════╝
`);
  }

  private setupEventHandlers(): void {
    this.rl.on('line', async (input: string) => {
      const query = input.trim();
      
      if (!query) {
        this.rl.prompt();
        return;
      }

      // Handle special commands
      if (query.toLowerCase() === 'quit' || query.toLowerCase() === 'exit') {
        await this.shutdown();
        return;
      }

      if (query.toLowerCase() === 'help') {
        this.showHelp();
        this.rl.prompt();
        return;
      }

      if (query.toLowerCase() === 'stats') {
        this.showStats();
        this.rl.prompt();
        return;
      }

      if (query.toLowerCase() === 'clear') {
        this.agent.clearMemory();
        console.log('🧹 Memory cleared');
        this.rl.prompt();
        return;
      }

      // Process the query
      console.log('🤔 Thinking...');
      const startTime = Date.now();
      
      try {
        const response = await this.agent.processQuery(query);
        const duration = Date.now() - startTime;
        
        console.log('\n📊 Response:');
        console.log('─'.repeat(60));
        console.log(response);
        console.log('─'.repeat(60));
        console.log(`⏱️  Processed in ${duration}ms\n`);
      } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      }
      
      this.rl.prompt();
    });

    this.rl.on('close', async () => {
      await this.shutdown();
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', async () => {
      console.log('\n👋 Goodbye!');
      await this.shutdown();
    });
  }

  private showHelp(): void {
    console.log(`
📚 InfluxDB Agent Help

Available Commands:
  help     - Show this help message
  stats    - Show memory and usage statistics
  clear    - Clear conversation memory
  quit     - Exit the application

Query Examples:
  • Database Operations:
    - "List all databases"
    - "Create a database called 'sensors'"
    - "Delete the test database"

  • Data Querying:
    - "Show me recent data from the temperature measurement"
    - "Query CPU usage from the last hour"
    - "Get the schema for the sensors measurement"

  • Health & Monitoring:
    - "Check database health"
    - "Show connection status"
    - "Get help with line protocol"

  • Token Management (Core/Enterprise):
    - "List all tokens"
    - "Create a new admin token"
    - "Delete token named 'old-token'"

Tips:
  • Be specific about database names when querying data
  • Use natural language - the agent will translate to appropriate SQL
  • The agent remembers previous conversations for context
  • Check health first if you encounter connection issues
`);
  }

  private showStats(): void {
    const stats = this.agent.getMemoryStats();
    const tools = this.mcpClient.getTools();
    const resources = this.mcpClient.getResources();
    
    console.log(`
📈 Agent Statistics

Memory:
  • Total conversations: ${stats.total}
  • Tools used: ${stats.toolsUsed.join(', ') || 'None'}

Available Capabilities:
  • Tools: ${tools.length}
  • Resources: ${resources.length}
  • Memory enabled: ${stats.total > 0 ? 'Yes' : 'No'}

Recent Tools Used:
${stats.toolsUsed.slice(-5).map(tool => `  • ${tool}`).join('\n') || '  • None'}
`);
  }

  private async shutdown(): Promise<void> {
    console.log('\n🔄 Shutting down...');
    
    try {
      await this.mcpClient.disconnect();
      this.rl.close();
      console.log('✅ Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
}