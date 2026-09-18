import {configuration,vault} from '../core.mjs';
import {database} from '../store.mjs';
import {hermesAdapter} from '../hermes.mjs';

// Read-only contract check: never print memory, task prompts, credentials or job IDs.
const config=configuration(),store=database(config.dataDir);
try {
  const rows=store.all('SELECT owner FROM connections WHERE origin=?',process.argv[2]);
  if(rows.length!==1)throw new Error('Expected exactly one configured connection');
  const adapter=hermesAdapter(config,store,vault(config.dataDir)),owner=rows[0].owner;
  const soul=await adapter.content(owner,'soul');
  console.log(JSON.stringify({resource:'soul',readable:true,characters:soul.content.length,versioned:Boolean(soul.revision)}));
  const schedules=await adapter.inspect(owner,'schedules');
  console.log(JSON.stringify({resource:'schedules',readable:true,count:schedules.items.length}));
  if(schedules.items[0]){
    const detail=await adapter.content(owner,schedules.items[0].id);
    console.log(JSON.stringify({resource:'schedule-detail',readable:true,versioned:Boolean(detail.revision),historyAvailable:!detail.historyError,runCount:detail.runs?.length}));
  }
}finally{store.db.close();}
