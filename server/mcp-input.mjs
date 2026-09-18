import {z} from 'zod';

export const externalMcpInput=z.object({
  name:z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/),
  url:z.string().url().max(2048).refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search;}),
  auth:z.enum(['none','oauth']),confirm:z.literal(true)
}).strict();
