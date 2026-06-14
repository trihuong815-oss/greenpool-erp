// V6.5 Phase A: tạo composite index cho cron retry-failed-push.
// Query: notifications where pushStatus='failed' AND nextRetryAt <= now
// → Cần composite index: pushStatus ASC + nextRetryAt ASC
//
// Dùng Google Cloud Firestore Admin REST API qua service account JWT.

const admin = require('firebase-admin');
const sa = require('../secrets/firebase-admin-sa.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });

(async () => {
  // Lấy access token từ service account credential
  const accessToken = await admin.app().options.credential.getAccessToken();
  const token = accessToken.access_token;
  const projectId = sa.project_id;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/notifications/indexes`;

  const body = {
    queryScope: 'COLLECTION',
    fields: [
      { fieldPath: 'pushStatus', order: 'ASCENDING' },
      { fieldPath: 'nextRetryAt', order: 'ASCENDING' },
      { fieldPath: '__name__', order: 'ASCENDING' },
    ],
  };

  console.log(`POST ${url}`);
  console.log('body:', JSON.stringify(body));
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\nstatus ${res.status}`);
  console.log(text);
  process.exit(res.status >= 200 && res.status < 300 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
