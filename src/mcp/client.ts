import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import { McpTool, McpResource, McpPrompt } from '../types/index.js';
import { config } from '../config/index.js';

export class McpClient {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private serverProcess: ChildProcess | null = null;
  private tools: McpTool[] = [];
  private resources: McpResource[] = [];
  private prompts: McpPrompt[] = [];

  constructor() {
    this.client = new Client(
      {
        name: 'influxdb-agent-client',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );
  }

  async connect(): Promise<void> {
    try {
      // Start the MCP server process
      this.serverProcess = spawn(config.mcp.serverCommand, config.mcp.serverArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          INFLUX_DB_INSTANCE_URL: config.influxdb.instanceUrl,
          INFLUX_DB_TOKEN: config.influxdb.token,
          INFLUX_DB_PRODUCT_TYPE: config.influxdb.productType,
        },
      });

      if (!this.serverProcess.stdin || !this.serverProcess.stdout) {
        throw new Error('Failed to create server process stdio streams');
      }

      // Create transport
      this.transport = new StdioClientTransport({
        stdin: this.serverProcess.stdin,
        stdout: this.serverProcess.stdout,
      });

      // Connect client
      await this.client.connect(this.transport);

      // Load available capabilities
      await this.loadCapabilities();

      console.log('✅ MCP Client connected successfully');
      console.log(`📊 Loaded ${this.tools.length} tools, ${this.resources.length} resources, ${this.prompts.length} prompts`);
    } catch (error) {
      console.error('❌ Failed to connect MCP client:', error);
      throw error;
    }
  }

  private async loadCapabilities(): Promise<void> {
    try {
      // Load tools
      const toolsResponse = await this.client.request(
        { method: 'tools/list' },
        { method: 'tools/list', params: {} }
      );
      this.tools = toolsResponse.tools || [];

      // Load resources
      const resourcesResponse = await this.client.request(
        { method: 'resources/list' },
        { method: 'resources/list', params: {} }
      );
      this.resources = resourcesResponse.resources || [];

      // Load prompts
      const promptsResponse = await this.client.request(
        { method: 'prompts/list' },
        { method: 'prompts/list', params: {} }
      );
      this.prompts = promptsResponse.prompts || [];
    } catch (error) {
      console.error('Failed to load MCP capabilities:', error);
      throw error;
    }
  }

  async callTool(name: string, args: any = {}): Promise<any> {
    try {
      const response = await this.client.request(
        { method: 'tools/call' },
        {
          method: 'tools/call',
          params: {
            name,
            arguments: args,
          },
        }
      );
      return response;
    } catch (error) {
      console.error(`Failed to call tool ${name}:`, error);
      throw error;
    }
  }

  async readResource(uri: string): Promise<any> {
    try {
      const response = await this.client.request(
        { method: 'resources/read' },
        {
          method: 'resources/read',
          params: { uri },
        }
      );
      return response;
    } catch (error) {
      console.error(`Failed to read resource ${uri}:`, error);
      throw error;
    }
  }

  async getPrompt(name: string, args: any = {}): Promise<any> {
    try {
      const response = await this.client.request(
        { method: 'prompts/get' },
        {
          method: 'prompts/get',
          params: {
            name,
            arguments: args,
          },
        }
      );
      return response;
    } catch (error) {
      console.error(`Failed to get prompt ${name}:`, error);
      throw error;
    }
  }

  getTools(): McpTool[] {
    return this.tools;
  }

  getResources(): McpResource[] {
    return this.resources;
  }

  getPrompts(): McpPrompt[] {
    return this.prompts;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.client.close();
      }
      if (this.serverProcess) {
        this.serverProcess.kill();
      }
      console.log('✅ MCP Client disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting MCP client:', error);
    }
  }
}