const axios = require('axios');

const url = 'https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-12.10.0-amd64-netinst.iso';

axios.head(url)
  .then(response => {
    const length = response.headers['content-length'];
    if (length) {
      console.log(`File size: ${(length / 1024 / 1024).toFixed(2)} MB`);
    } else {
      console.log('Content-Length header not found.');
    }
  })
  .catch(error => {
    console.error('Error fetching file size:', error.message);
  });
