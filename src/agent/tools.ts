import { DynamicTool } from '@langchain/core/tools';
import { McpClient } from '../mcp/client.js';
import { z } from 'zod';

export class McpToolWrapper extends DynamicTool {
  constructor(
    private mcpClient: McpClient,
    private toolName: string,
    private toolDescription: string,
    private inputSchema: any
  ) {
    super({
      name: toolName,
      description: toolDescription,
      func: async (input: string) => {
        try {
          // Parse input if it's a JSON string
          let args = {};
          if (input.trim()) {
            try {
              args = JSON.parse(input);
            } catch {
              // If not JSON, treat as simple string input
              args = { query: input };
            }
          }

          const result = await this.mcpClient.callTool(toolName, args);
          
          // Extract text content from MCP response
          if (result.content && Array.isArray(result.content)) {
            const textContent = result.content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join('\n');
            return textContent || JSON.stringify(result);
          }
          
          return JSON.stringify(result);
        } catch (error) {
          return `Error calling tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    });
  }
}

export function createMcpTools(mcpClient: McpClient): McpToolWrapper[] {
  const tools: McpToolWrapper[] = [];
  
  for (const tool of mcpClient.getTools()) {
    const mcpTool = new McpToolWrapper(
      mcpClient,
      tool.name,
      tool.description,
      tool.inputSchema
    );
    tools.push(mcpTool);
  }
  
  return tools;
}

// Specialized tool for getting help
export function createHelpTool(mcpClient: McpClient): DynamicTool {
  return new DynamicTool({
    name: 'get_influxdb_help',
    description: 'Get comprehensive help and guidance for InfluxDB operations, troubleshooting, and best practices',
    func: async () => {
      try {
        const result = await mcpClient.callTool('get_help', {});
        if (result.content && Array.isArray(result.content)) {
          return result.content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('\n');
        }
        return JSON.stringify(result);
      } catch (error) {
        return `Error getting help: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

// Specialized tool for health checks
export function createHealthCheckTool(mcpClient: McpClient): DynamicTool {
  return new DynamicTool({
    name: 'check_influxdb_health',
    description: 'Check the health and connectivity status of the InfluxDB instance',
    func: async () => {
      try {
        const result = await mcpClient.callTool('health_check', {});
        if (result.content && Array.isArray(result.content)) {
          return result.content
            .filter(item => item.type === 'text')
            .map(item => item.text)
            .join('\n');
        }
        return JSON.stringify(result);
      } catch (error) {
        return `Error checking health: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}