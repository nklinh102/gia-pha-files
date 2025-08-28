// Đặt tên và phiên bản cho cache
const CACHE_NAME = 'family-tree-cache-v1';

// Danh sách các file cần thiết để ứng dụng hoạt động offline
const URLS_TO_CACHE = [
  '/', // Trang HTML chính của bạn
  'https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js',
  'https://fonts.googleapis.com/css2?family=Tac+One&display=swap'
  // Chúng ta không cache các file API của Google vì chúng cần luôn được cập nhật
];

// 1. Cài đặt Service Worker và cache các tài nguyên
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// 2. Phục vụ tài nguyên từ cache (Cache-First Strategy)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Nếu tìm thấy trong cache, trả về nó
        if (response) {
          return response;
        }
        // Nếu không, đi lấy từ mạng
        return fetch(event.request);
      }
    )
  );
});

// 3. Xóa các cache cũ khi Service Worker được cập nhật
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});