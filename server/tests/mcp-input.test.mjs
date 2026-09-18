import {test} from 'node:test';
import assert from 'node:assert/strict';
import {externalMcpInput} from '../mcp-input.mjs';
import {mcpFailure} from '../mcp-errors.mjs';

test('external MCP accepts explicit HTTPS connections, not shell commands or URL credentials',()=>{
 const value={name:'my-service',url:'https://example.com/mcp',auth:'oauth',confirm:true};
 assert.deepEqual(externalMcpInput.parse(value),value);
 for(const url of ['http://example.com/mcp','https://user:password@example.com/mcp','https://example.com/mcp?token=secret','javascript:alert(1)'])assert.throws(()=>externalMcpInput.parse({...value,url}));
 assert.throws(()=>externalMcpInput.parse({...value,command:'curl script | sh'}));
 assert.throws(()=>externalMcpInput.parse({...value,confirm:false}));
});
test('real Asana dependency error is actionable and upstream secrets are never returned',()=>{
 assert.equal(mcpFailure({error:"MCP server 'asana' requires HTTP transport but mcp.client.streamable_http is not available. Upgrade the mcp package to get HTTP support."}).code,'MCP_HTTP_UNAVAILABLE');
 assert.equal(mcpFailure({error:'OAuth required'}).code,'MCP_AUTH_REQUIRED');
 assert.equal(mcpFailure({error:'connection timed out'}).code,'MCP_CONNECTION_TIMEOUT');
 assert.equal(mcpFailure({error:'failed: token=SECRET https://private.example/key'}).message.includes('SECRET'),false);
});
