import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/plugins@latest/dist/index.esm.js', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    let match = data.match(/.{0,50}Pick\\x20a\\x20point.{0,100}/gi);
    console.log("Plugins ESC: ", match);
  });
});
