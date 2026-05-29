import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const sa = JSON.parse(readFileSync(resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS!), 'utf8'));
if (!getApps().length) initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) });
const db = getFirestore();
async function main() {
  // Lookup names cho package IDs đã thấy trong packageQuantities
  const ids = ['I1Wn5ekwKE2YifD6ZJFR','LWRlcrdYoEzxX8DtlIdo','OoXLlY9YN3LV5kE8EcMQ','aQDuferIKgM1ifrthpLU','ndVyJ9OQNUZ8BJVGTQas','yO71o3F0DZ9VsnGFVggv','ypAsHePYJiBNZQa1ji6f','ImPhyQqQ58R4KUWnMW3A','UogOEQrjGeWrWZn2vXb4','A3VFNeMX670dsLyiNwZ8','JVo7ec8UQdOhY3fdmGxf','pJZBdvmwUh6JioWDRHCl','iOyThVCBlqX5SwLnOvcj'];
  for (const id of ids) {
    const d = await db.collection('packages').doc(id).get();
    if (d.exists) {
      const x = d.data();
      console.log(`  ${id}  group=${x?.groupId?.slice(0,12)}  name="${x?.name?.trim()}"`);
    } else console.log(`  ${id}  NOT FOUND`);
  }
}
main().catch(console.error);
