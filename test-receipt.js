const fs = require('fs');

const imageFilename = process.argv[2] || 'IMG-20260918-WA0009.jpg';
const imageBase64 = fs.readFileSync(imageFilename).toString('base64');

fetch('http://localhost:3000/parse-receipt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    imageBase64,
    mimeType: 'image/jpeg'
  })
})
  .then(response => response.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });