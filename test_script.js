import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/plugins@latest/dist/index.esm.js', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    let match = data.match(/.{0,50}Pick a point.{0,50}/gi);
    console.log("Plugins: ", match);
  });
});
