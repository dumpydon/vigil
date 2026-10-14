// Retire the old root-scoped shell. IndexedDB, drafts, queues and localStorage stay intact.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  await self.clients.claim();
  await self.registration.unregister();
})()));
