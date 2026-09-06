/** Remove legacy server-settings bodies, which could contain invitation tokens. */
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('api-auth-sensitive'))
})
