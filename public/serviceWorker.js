const NEXTCHAT_LITE_CACHE = "nextchat-lite-cache";
const NEXTCHAT_LITE_FILE_CACHE = "nextchat-lite-file";

// 64 URL-safe characters used for generating unique identifiers
const URL_ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

/**
 * Generate a cryptographically secure unique identifier (nanoid algorithm).
 * @param {number} size - Length of the generated ID.
 * @returns {string} The unique identifier.
 */
function nanoid(size = 21) {
  let id = "";
  const randomBytes = crypto.getRandomValues(new Uint8Array(size));
  for (let i = 0; i < size; i++) {
    id += URL_ALPHABET[63 & randomBytes[i]];
  }
  return id;
}

self.addEventListener("activate", () => {
  console.log("ServiceWorker activated.");
});

self.addEventListener("install", (event) => {
  self.skipWaiting(); // Skip waiting to activate the new version immediately
  event.waitUntil(
    caches.open(NEXTCHAT_LITE_CACHE).then((cache) => {
      return cache.addAll([]);
    }),
  );
});

/**
 * Construct a standardized JSON HTTP response.
 * @param {any} data - Payload to serialize.
 * @returns {Response}
 */
function jsonify(data) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}

/**
 * Handle virtual image upload: save the blob into Cache Storage and return a virtual URL.
 * @param {Request} request - The upload HTTP request.
 * @param {URL} url - Parsed request URL.
 * @returns {Promise<Response>}
 */
async function upload(request, url) {
  const formData = await request.formData();
  const file = formData.getAll("file")[0];
  let ext = file.name.split(".").pop();
  if (ext === "blob") {
    ext = file.type.split("/").pop();
  }

  const fileUrl = `${url.origin}/api/cache/${nanoid()}.${ext}`;
  const cache = await caches.open(NEXTCHAT_LITE_FILE_CACHE);

  await cache.put(
    new Request(fileUrl),
    new Response(file, {
      headers: {
        "content-type": file.type,
        "content-length": file.size,
        "cache-control": "no-cache", // File already stored in client disk cache
        server: "ServiceWorker",
      },
    }),
  );

  return jsonify({ code: 0, data: fileUrl });
}

/**
 * Delete a specific cached file from Cache Storage.
 * @param {Request} request - The delete request containing the file URL.
 * @returns {Promise<Response>}
 */
async function remove(request) {
  const cache = await caches.open(NEXTCHAT_LITE_FILE_CACHE);
  await cache.delete(request.url);
  return jsonify({ code: 0 });
}

// Intercept all virtual API requests prefixed with /api/cache
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (/^\/api\/cache/.test(url.pathname)) {
    if (event.request.method === "GET") {
      event.respondWith(caches.match(event.request));
    } else if (event.request.method === "POST") {
      event.respondWith(upload(event.request, url));
    } else if (event.request.method === "DELETE") {
      event.respondWith(remove(event.request));
    }
  }
});
