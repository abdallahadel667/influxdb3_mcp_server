import { StateGraph, END } from 'langgraph';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AgentState } from '../types/index.js';
import { McpClient } from '../mcp/client.js';
import { ConversationMemoryManager } from '../memory/conversation.js';
import { createMcpTools, createHelpTool, createHealthCheckTool } from './tools.js';
import { 
  SYSTEM_PROMPT, 
  QUERY_ANALYSIS_PROMPT, 
  RESULT_SUMMARIZATION_PROMPT,
  ERROR_HANDLING_PROMPT 
} from '../prompts/templates.js';
import { config } from '../config/index.js';
import { 
  createInitialState, 
  updateState, 
  addContext, 
  addToolUsage, 
  addResult, 
  shouldContinue 
} from './state.js';

export class InfluxDBAgent {
  private model: ChatGoogleGenerativeAI;
  private mcpClient: McpClient;
  private memory: ConversationMemoryManager;
  private tools: any[];
  private graph: StateGraph<AgentState>;

  constructor(mcpClient: McpClient) {
    this.mcpClient = mcpClient;
    this.memory = new ConversationMemoryManager();
    
    this.model = new ChatGoogleGenerativeAI({
      modelName: 'gemini-1.5-pro',
      temperature: config.agent.temperature,
      apiKey: config.google.apiKey,
    });

    this.tools = [
      ...createMcpTools(mcpClient),
      createHelpTool(mcpClient),
      createHealthCheckTool(mcpClient),
    ];

    this.graph = this.createGraph();
  }

  private createGraph(): StateGraph<AgentState> {
    const graph = new StateGraph<AgentState>({
      channels: {
        query: null,
        context: null,
        tools_used: null,
        results: null,
        final_answer: null,
        iteration: null,
        max_iterations: null,
      },
    });

    // Add nodes
    graph.addNode('analyze_query', this.analyzeQuery.bind(this));
    graph.addNode('execute_tools', this.executeTools.bind(this));
    graph.addNode('synthesize_response', this.synthesizeResponse.bind(this));
    graph.addNode('handle_error', this.handleError.bind(this));

    // Add edges
    graph.addEdge('analyze_query', 'execute_tools');
    graph.addEdge('execute_tools', 'synthesize_response');
    graph.addEdge('handle_error', 'synthesize_response');
    
    // Conditional edges
    graph.addConditionalEdges(
      'synthesize_response',
      this.shouldContinueOrEnd.bind(this),
      {
        continue: 'analyze_query',
        end: END,
      }
    );

    graph.setEntryPoint('analyze_query');

    return graph.compile();
  }

  private async analyzeQuery(state: AgentState): Promise<Partial<AgentState>> {
    try {
      const memoryContext = config.agent.enableMemory 
        ? this.memory.getMemoryContext() 
        : "No previous conversation history.";

      const availableTools = this.tools.map(tool => 
        `- ${tool.name}: ${tool.description}`
      ).join('\n');

      const systemPrompt = SYSTEM_PROMPT
        .replace('{memory_context}', memoryContext)
        .replace('{available_tools}', availableTools);

      const analysisPrompt = QUERY_ANALYSIS_PROMPT.replace('{query}', state.query);

      const response = await this.model.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: analysisPrompt },
      ]);

      const analysis = response.content as string;
      
      return {
        context: [...state.context, `Analysis: ${analysis}`],
      };
    } catch (error) {
      console.error('Error in analyzeQuery:', error);
      return {
        context: [...state.context, `Analysis error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  private async executeTools(state: AgentState): Promise<Partial<AgentState>> {
    try {
      // Determine which tools to use based on the query and context
      const toolsToUse = await this.selectTools(state);
      
      const results = [];
      const toolsUsed = [...state.tools_used];

      for (const toolCall of toolsToUse) {
        try {
          console.log(`🔧 Executing tool: ${toolCall.tool}`);
          
          const tool = this.tools.find(t => t.name === toolCall.tool);
          if (!tool) {
            results.push(`Tool ${toolCall.tool} not found`);
            continue;
          }

          const result = await tool.func(JSON.stringify(toolCall.args || {}));
          results.push({
            tool: toolCall.tool,
            args: toolCall.args,
            result: result,
          });
          
          toolsUsed.push(toolCall.tool);
          
          // Add small delay between tool calls
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error executing tool ${toolCall.tool}:`, error);
          results.push({
            tool: toolCall.tool,
            args: toolCall.args,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        results: [...state.results, ...results],
        tools_used: toolsUsed,
      };
    } catch (error) {
      console.error('Error in executeTools:', error);
      return {
        results: [...state.results, { error: error instanceof Error ? error.message : String(error) }],
      };
    }
  }

  private async selectTools(state: AgentState): Promise<Array<{ tool: string; args?: any; reasoning?: string }>> {
    // Simple tool selection logic based on query keywords
    const query = state.query.toLowerCase();
    const tools = [];

    // Health check for connection issues
    if (query.includes('health') || query.includes('status') || query.includes('connection')) {
      tools.push({ tool: 'check_influxdb_health', reasoning: 'User asking about health/status' });
    }

    // Help requests
    if (query.includes('help') || query.includes('how to') || query.includes('guide')) {
      tools.push({ tool: 'get_influxdb_help', reasoning: 'User requesting help' });
    }

    // Database listing
    if (query.includes('list database') || query.includes('show database') || query.includes('what database')) {
      tools.push({ tool: 'list_databases', reasoning: 'User wants to see available databases' });
    }

    // Query execution
    if (query.includes('select') || query.includes('query') || query.includes('data from')) {
      // Try to extract database name and query
      const dbMatch = query.match(/(?:from|database)\s+(\w+)/i);
      const database = dbMatch ? dbMatch[1] : 'mydb'; // default database
      
      // Extract or construct SQL query
      let sqlQuery = '';
      if (query.includes('select')) {
        const selectMatch = query.match(/select.*?(?=\s+(?:from|where|order|group|limit|$))/i);
        sqlQuery = selectMatch ? selectMatch[0] : 'SELECT * FROM measurement LIMIT 10';
      } else {
        sqlQuery = 'SELECT * FROM measurement ORDER BY time DESC LIMIT 10';
      }

      tools.push({ 
        tool: 'execute_query', 
        args: { database, query: sqlQuery, format: 'json' },
        reasoning: 'User wants to query data' 
      });
    }

    // Measurements/schema exploration
    if (query.includes('measurement') || query.includes('table') || query.includes('schema')) {
      const dbMatch = query.match(/(?:in|from|database)\s+(\w+)/i);
      const database = dbMatch ? dbMatch[1] : 'mydb';
      
      if (query.includes('list') || query.includes('show')) {
        tools.push({ 
          tool: 'get_measurements', 
          args: { database },
          reasoning: 'User wants to see available measurements' 
        });
      }
    }

    // If no specific tools identified, start with health check and database list
    if (tools.length === 0) {
      tools.push(
        { tool: 'check_influxdb_health', reasoning: 'Starting with health check' },
        { tool: 'list_databases', reasoning: 'Getting available databases' }
      );
    }

    return tools;
  }

  private async synthesizeResponse(state: AgentState): Promise<Partial<AgentState>> {
    try {
      const resultsText = state.results.map(result => 
        typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      ).join('\n\n');

      const summarizationPrompt = RESULT_SUMMARIZATION_PROMPT
        .replace('{query}', state.query)
        .replace('{results}', resultsText)
        .replace('{tools_used}', state.tools_used.join(', '));

      const response = await this.model.invoke([
        { role: 'system', content: 'You are an expert at summarizing InfluxDB query results.' },
        { role: 'user', content: summarizationPrompt },
      ]);

      const finalAnswer = response.content as string;

      // Store in memory if enabled
      if (config.agent.enableMemory) {
        this.memory.addMemory({
          query: state.query,
          response: finalAnswer,
          timestamp: new Date(),
          tools_used: state.tools_used,
        });
      }

      return {
        final_answer: finalAnswer,
      };
    } catch (error) {
      console.error('Error in synthesizeResponse:', error);
      return {
        final_answer: `I encountered an error while processing your request: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async handleError(state: AgentState): Promise<Partial<AgentState>> {
    const lastResult = state.results[state.results.length - 1];
    const error = lastResult?.error || 'Unknown error occurred';

    const errorPrompt = ERROR_HANDLING_PROMPT
      .replace('{operation}', state.tools_used[state.tools_used.length - 1] || 'unknown')
      .replace('{error}', error)
      .replace('{context}', state.context.join('\n'));

    try {
      const response = await this.model.invoke([
        { role: 'system', content: 'You are an expert at troubleshooting InfluxDB issues.' },
        { role: 'user', content: errorPrompt },
      ]);

      return {
        final_answer: response.content as string,
      };
    } catch (err) {
      return {
        final_answer: `I encountered an error: ${error}. Please check your InfluxDB connection and try again.`,
      };
    }
  }

  private shouldContinueOrEnd(state: AgentState): string {
    if (state.final_answer || state.iteration >= state.max_iterations) {
      return 'end';
    }
    return 'continue';
  }

  async processQuery(query: string): Promise<string> {
    console.log(`🤖 Processing query: "${query}"`);
    
    const initialState = createInitialState(query, config.agent.maxIterations);
    
    try {
      const result = await this.graph.invoke(initialState);
      return result.final_answer || 'I was unable to process your query. Please try again.';
    } catch (error) {
      console.error('Error processing query:', error);
      return `I encountered an error while processing your query: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  getMemoryStats() {
    return this.memory.getStats();
  }

  clearMemory() {
    this.memory.clear();
  }
}