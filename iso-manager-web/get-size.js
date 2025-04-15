const https = require('https');
const { URL } = require('url');

const inputUrl = process.argv[2];
if (!inputUrl) {
  console.error("Usage: node get-size.js <url>");
  process.exit(1); // Error code 1: missing argument
}

function getFileSize(url) {
  const req = https.request(url, { method: 'HEAD' }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      // Follow redirect
      const newUrl = new URL(res.headers.location, url).href;
      getFileSize(newUrl);
    } else if (res.statusCode === 200) {
      const length = res.headers['content-length'];
      if (length) {
        console.log(length);
        process.exit(0); // Success
      } else {
        console.error("Error: Content-Length header not found.");
        process.exit(2); // Error code 2: no content-length
      }
    } else {
      console.error(`Error: Server responded with status ${res.statusCode}`);
      process.exit(3); // Error code 3: bad HTTP status
    }
  });

  req.on('error', err => {
    console.error("Request failed:", err.message);
    process.exit(4); // Error code 4: request failed
  });

  req.end();
}

getFileSize(inputUrl);
