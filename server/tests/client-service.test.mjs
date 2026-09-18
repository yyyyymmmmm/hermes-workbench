import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clientService} from '../client-service.mjs';
test('hosted release requires an explicit HTTPS service; previews never invent an endpoint',()=>{
 assert.equal(clientService({}).mode,'preview');
 assert.throws(()=>clientService({WORKBENCH_RELEASE:'true'}));
 assert.equal(clientService({WORKBENCH_SERVICE_ORIGIN:'https://workbench.example.test/'}).origin,'https://workbench.example.test');
 for(const origin of ['http://example.test','https://user:pass@example.test','https://example.test/api','https://localhost','https://example.test/?token=secret'])assert.throws(()=>clientService({WORKBENCH_SERVICE_ORIGIN:origin}));
});
