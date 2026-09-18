import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { hash, Fault } from './core.mjs';

export function database(directory) {
  const db = new DatabaseSync(resolve(directory, 'workbench.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 9) { db.close(); throw new Error('Database schema is newer than this application'); }
  if (version === 0) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), token TEXT UNIQUE NOT NULL, csrf TEXT NOT NULL, device TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks(owner TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, body TEXT NOT NULL, version INTEGER NOT NULL, revision INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner,id));
    CREATE TABLE IF NOT EXISTS revisions(owner TEXT PRIMARY KEY REFERENCES users(id), value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mutations(owner TEXT NOT NULL REFERENCES users(id), key TEXT NOT NULL, hash TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(owner,key));
    CREATE TABLE IF NOT EXISTS connections(owner TEXT PRIMARY KEY REFERENCES users(id), id TEXT NOT NULL, origin TEXT NOT NULL, username TEXT NOT NULL, jar TEXT NOT NULL, catalog TEXT, preference TEXT, updated INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(owner,expires);
    CREATE INDEX IF NOT EXISTS tasks_revision ON tasks(owner,revision);
    PRAGMA user_version=1; COMMIT;`);
  if (version < 2) db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE conversations(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),connection_id TEXT NOT NULL,title TEXT NOT NULL,remote_id TEXT,created INTEGER NOT NULL);
    CREATE INDEX conversations_owner ON conversations(owner,created);
    CREATE TABLE runs(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),conversation_id TEXT NOT NULL REFERENCES conversations(id),request_key TEXT NOT NULL,fingerprint TEXT NOT NULL,prompt TEXT NOT NULL,status TEXT NOT NULL,output TEXT NOT NULL DEFAULT '',runtime_id TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,UNIQUE(owner,request_key));
    CREATE UNIQUE INDEX runs_active_owner ON runs(owner) WHERE status IN ('queued','running','approval','stopping','unknown');
    CREATE INDEX runs_owner_time ON runs(owner,created);
    CREATE TABLE run_events(run_id TEXT NOT NULL REFERENCES runs(id),seq INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(run_id,seq));
    CREATE TABLE run_requests(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id),remote_id TEXT NOT NULL,method TEXT NOT NULL,rpc INTEGER NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL);
    PRAGMA user_version=2; COMMIT;`);
  if(version<3)db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE conversations ADD COLUMN execution_granted INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE run_attachments(run_id TEXT NOT NULL REFERENCES runs(id),position INTEGER NOT NULL,name TEXT NOT NULL,content TEXT NOT NULL,bytes INTEGER NOT NULL,PRIMARY KEY(run_id,position));
    PRAGMA user_version=3; COMMIT;`);
  if(version<4)db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE documents(owner TEXT NOT NULL REFERENCES users(id),id TEXT NOT NULL,name TEXT NOT NULL,content TEXT NOT NULL,bytes INTEGER NOT NULL,version INTEGER NOT NULL,deleted INTEGER NOT NULL,updated INTEGER NOT NULL,purged INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,id));
    CREATE INDEX documents_owner_updated ON documents(owner,updated);
    CREATE TABLE document_versions(owner TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,name TEXT NOT NULL,content TEXT NOT NULL,bytes INTEGER NOT NULL,deleted INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(owner,id,version),FOREIGN KEY(owner,id) REFERENCES documents(owner,id));
    CREATE TABLE document_mutations(owner TEXT NOT NULL REFERENCES users(id),key TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(owner,key));
    PRAGMA user_version=4; COMMIT;`);
  if(version<5)db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE projects(owner TEXT NOT NULL REFERENCES users(id),id TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(owner,id));
    CREATE TABLE project_links(owner TEXT NOT NULL,project_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('task','document')),resource_id TEXT NOT NULL,PRIMARY KEY(owner,project_id,kind,resource_id),FOREIGN KEY(owner,project_id) REFERENCES projects(owner,id));
    CREATE INDEX project_links_resource ON project_links(owner,kind,resource_id);
    PRAGMA user_version=5; COMMIT;`);
  if(version<6)db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE task_sources(owner TEXT NOT NULL,task_id TEXT NOT NULL,run_id TEXT NOT NULL REFERENCES runs(id),item INTEGER NOT NULL,PRIMARY KEY(owner,run_id,item),FOREIGN KEY(owner,task_id) REFERENCES tasks(owner,id));
    CREATE TABLE task_imports(owner TEXT NOT NULL REFERENCES users(id),key TEXT NOT NULL,fingerprint TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(owner,key));
    PRAGMA user_version=6; COMMIT;`);
  if(version<7)db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE conversations ADD COLUMN project_id TEXT;
    ALTER TABLE conversations ADD COLUMN project_access TEXT NOT NULL DEFAULT '{"tasks":false,"documents":[]}';
    ALTER TABLE runs ADD COLUMN project_context TEXT;
    CREATE TABLE project_policies(owner TEXT NOT NULL,project_id TEXT NOT NULL,auto_create INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,project_id),FOREIGN KEY(owner,project_id) REFERENCES projects(owner,id));
    CREATE TABLE workbench_actions(run_id TEXT PRIMARY KEY REFERENCES runs(id),owner TEXT NOT NULL,proposal TEXT NOT NULL,status TEXT NOT NULL,receipt TEXT,error TEXT NOT NULL DEFAULT '',updated INTEGER NOT NULL);
    PRAGMA user_version=7; COMMIT;`);
  if(version<8)db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE conversations ADD COLUMN category TEXT NOT NULL DEFAULT '';
    ALTER TABLE conversations ADD COLUMN metadata_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE runs ADD COLUMN agent_mode INTEGER NOT NULL DEFAULT 0;
    PRAGMA user_version=8; COMMIT;`);
  if(version<9)db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE conversations ADD COLUMN agent_profile TEXT NOT NULL DEFAULT 'default';
    CREATE TABLE profile_access(owner TEXT NOT NULL REFERENCES users(id),connection_id TEXT NOT NULL,name TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(owner,connection_id,name));
    PRAGMA user_version=9; COMMIT;`);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  return { db, run, one, all,
    user(identity) {
      run('INSERT INTO users VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET name=excluded.name', randomUUID(), identity.username, identity.name || identity.username);
      return one('SELECT * FROM users WHERE username=?', identity.username);
    },
    tasks(owner) { return all('SELECT body FROM tasks WHERE owner=? AND deleted=0 ORDER BY revision DESC', owner).map(r => JSON.parse(r.body)); },
    mutate(owner, key, payload, {restore=false}={}) {
      db.exec('SAVEPOINT task_mutation');
      try {
        const fingerprint = hash(JSON.stringify(payload)), previous = one('SELECT * FROM mutations WHERE owner=? AND key=?', owner, key);
        if (previous) {
          if (previous.hash !== fingerprint) throw new Fault(409, 'IDEMPOTENCY_CONFLICT', 'Mutation key was already used for another request');
          db.exec('RELEASE task_mutation'); return JSON.parse(previous.response);
        }
        const existing = one('SELECT * FROM tasks WHERE owner=? AND id=?', owner, payload.id);
        if ((existing?.version || 0) !== payload.version || (existing?.deleted&&!restore)) throw new Fault(409, 'VERSION_CONFLICT', 'Task changed on another device; refresh before editing');
        if (!existing && payload.deleted) throw new Fault(404, 'TASK_NOT_FOUND', 'Task was not found');
        run('INSERT INTO revisions VALUES(?,1) ON CONFLICT(owner) DO UPDATE SET value=value+1', owner);
        const revision = one('SELECT value FROM revisions WHERE owner=?', owner).value;
        const task = { ...payload, version: payload.version + 1, revision, updatedAt: new Date().toISOString() };
        delete task.linkProject;
        delete task.sourceRunId;
        const provenance=one('SELECT run_id FROM task_sources WHERE owner=? AND task_id=?',owner,task.id);
        if(provenance)task.sourceRunId=provenance.run_id;
        if(payload.linkProject&&!one('SELECT id FROM projects WHERE owner=? AND id=? AND archived=0',owner,payload.linkProject))throw new Fault(409,'PROJECT_UNAVAILABLE','Project unavailable or archived');
        run('INSERT INTO tasks VALUES(?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET body=excluded.body,version=excluded.version,revision=excluded.revision,deleted=excluded.deleted', owner, task.id, JSON.stringify(task), task.version, revision, Number(task.deleted));
        run('INSERT INTO mutations VALUES(?,?,?,?)', owner, key, fingerprint, JSON.stringify(task));
        if(payload.linkProject){
          const added=run("INSERT OR IGNORE INTO project_links VALUES(?,?,'task',?)",owner,payload.linkProject,task.id);
          if(added.changes)run('UPDATE projects SET version=version+1,updated=? WHERE owner=? AND id=?',Date.now(),owner,payload.linkProject);
        }
        db.exec('RELEASE task_mutation'); return task;
      } catch (e) { if (db.isTransaction) db.exec('ROLLBACK TO task_mutation; RELEASE task_mutation;'); throw e; }
    }
  };
}
