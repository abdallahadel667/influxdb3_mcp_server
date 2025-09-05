export interface McpTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface McpResource {
  name: string;
  uri: string;
  description: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export interface QueryResult {
  success: boolean;
  data?: any;
  error?: string;
  summary?: string;
}

export interface AgentState {
  query: string;
  context: string[];
  tools_used: string[];
  results: any[];
  final_answer: string;
  iteration: number;
  max_iterations: number;
}

export interface ConversationMemory {
  query: string;
  response: string;
  timestamp: Date;
  tools_used: string[];
}