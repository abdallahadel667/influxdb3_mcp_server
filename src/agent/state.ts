import { AgentState } from '../types/index.js';

export function createInitialState(query: string, maxIterations: number = 10): AgentState {
  return {
    query,
    context: [],
    tools_used: [],
    results: [],
    final_answer: '',
    iteration: 0,
    max_iterations: maxIterations,
  };
}

export function updateState(
  state: AgentState,
  updates: Partial<AgentState>
): AgentState {
  return {
    ...state,
    ...updates,
    iteration: state.iteration + 1,
  };
}

export function addContext(state: AgentState, context: string): AgentState {
  return {
    ...state,
    context: [...state.context, context],
  };
}

export function addToolUsage(state: AgentState, toolName: string): AgentState {
  return {
    ...state,
    tools_used: [...state.tools_used, toolName],
  };
}

export function addResult(state: AgentState, result: any): AgentState {
  return {
    ...state,
    results: [...state.results, result],
  };
}

export function shouldContinue(state: AgentState): boolean {
  return (
    state.iteration < state.max_iterations &&
    !state.final_answer &&
    state.query.trim() !== ''
  );
}