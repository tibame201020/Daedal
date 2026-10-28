import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('../src/', import.meta.url));
test('original Ikaros source size standard: modules <=300 lines and declared top-level functions <=50 lines', () => {
 for (const file of readdirSync(directory).filter(name => name.endsWith('.mjs'))) {
   const lines = readFileSync(join(directory,file),'utf8').trimEnd().split(/\r?\n/);
   assert.ok(lines.length <= 300, file + ': ' + lines.length + ' lines exceeds 300');
   for(let i=0;i<lines.length;i++){
     const name = lines[i].match(/^(?:export )?function (\w+)\(/)?.[1];
     if(!name) continue;
     let end=i+1;
     while(end<lines.length && !/^}\s*;?$/.test(lines[end])) end++;
     assert.ok(end<lines.length, file+': '+name+' missing top-level function ending');
     assert.ok(end-i+1<=50, file+': '+name+' exceeds 50 lines ('+(end-i+1)+')');
   }
 }
});
