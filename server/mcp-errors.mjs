import {Fault} from './core.mjs';

// Classify known failures without forwarding upstream tokens, URLs or tracebacks.
export function mcpFailure(data){
  const message=typeof data?.error==='string'?data.error:'';
  if(/mcp\.client\.streamable_http|HTTP transport.*not available/i.test(message))return new Fault(502,'MCP_HTTP_UNAVAILABLE','Gateway MCP package lacks HTTP transport support');
  if(/unauthorized|authentication required|not authenticated|401|oauth.*required/i.test(message))return new Fault(409,'MCP_AUTH_REQUIRED','MCP account authorization is required');
  if(/timeout|timed out/i.test(message))return new Fault(504,'MCP_CONNECTION_TIMEOUT','MCP server connection timed out');
  return new Fault(502,'MCP_OPERATION_FAILED','MCP operation failed; inspect gateway diagnostics');
}
