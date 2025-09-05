import { ConversationMemory } from '../types/index.js';
import { config } from '../config/index.js';

export class ConversationMemoryManager {
  private memories: ConversationMemory[] = [];
  private maxSize: number;

  constructor() {
    this.maxSize = config.agent.memorySize;
  }

  addMemory(memory: ConversationMemory): void {
    this.memories.push(memory);
    
    // Keep only the most recent memories
    if (this.memories.length > this.maxSize) {
      this.memories = this.memories.slice(-this.maxSize);
    }
  }

  getRecentMemories(count: number = 5): ConversationMemory[] {
    return this.memories.slice(-count);
  }

  getRelevantMemories(query: string, count: number = 3): ConversationMemory[] {
    // Simple relevance scoring based on keyword overlap
    const queryWords = query.toLowerCase().split(/\s+/);
    
    const scoredMemories = this.memories.map(memory => {
      const memoryText = `${memory.query} ${memory.response}`.toLowerCase();
      const score = queryWords.reduce((acc, word) => {
        return acc + (memoryText.includes(word) ? 1 : 0);
      }, 0);
      
      return { memory, score };
    });

    return scoredMemories
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(item => item.memory);
  }

  getMemoryContext(): string {
    const recentMemories = this.getRecentMemories(3);
    if (recentMemories.length === 0) {
      return "No previous conversation history.";
    }

    return recentMemories
      .map(memory => `Q: ${memory.query}\nA: ${memory.response}\nTools used: ${memory.tools_used.join(', ')}\n`)
      .join('\n---\n');
  }

  clear(): void {
    this.memories = [];
  }

  getStats(): { total: number; toolsUsed: string[] } {
    const allTools = this.memories.flatMap(m => m.tools_used);
    const uniqueTools = [...new Set(allTools)];
    
    return {
      total: this.memories.length,
      toolsUsed: uniqueTools,
    };
  }
}