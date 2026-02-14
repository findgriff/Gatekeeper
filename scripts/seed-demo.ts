import fs from 'fs';
import path from 'path';
import { GateKeeperDB } from '../src/main/db';

const outDir = path.resolve(process.cwd(), '.demo-data');
fs.mkdirSync(outDir, { recursive: true });
const dbPath = path.join(outDir, 'gatekeeper-demo.sqlite');

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new GateKeeperDB(dbPath);

const people = [
  {
    full_name: 'Jordan Pike',
    company: 'North Ridge Electric',
    address: '110 Mason Blvd',
    phone: '555-110-9832',
    email: 'jordan.pike@northridge.example'
  },
  {
    full_name: 'Elena Mora',
    company: 'Atlas Freight',
    address: '22 Harbor Ave',
    phone: '555-441-1208',
    email: 'elena.mora@atlasfreight.example'
  },
  {
    full_name: 'Avery Knox',
    company: 'Morrow Controls',
    address: '88 Foundry Street',
    phone: '555-992-4100',
    email: 'avery.knox@morrow.example'
  }
];

const saved = people.map((person) => db.savePerson(person));

for (const person of saved) {
  const visit = db.createVisit({
    person_id: person.person_id,
    escort_status: Math.random() > 0.5 ? 'ESCORTED' : 'UNESCORTED',
    expires_at: null
  });
  db.scan(visit.visit_id, visit.badge_barcode, 'IN', 'admin', 'DEMO-1');
}

db.createOperator('operator1', 'operator1234', 'OPERATOR');
db.close();

console.log(`Demo seed created at: ${dbPath}`);
