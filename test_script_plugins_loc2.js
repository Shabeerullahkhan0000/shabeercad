import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/plugins@latest/dist/index.esm.js', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    let match = data.match(/.{0,50}i18n\$8.{0,50}/gi);
    console.log("i18n$8: ", match);
    match = data.match(/.{0,50}\['measure'\].{0,100}/gi); // look for any usage
    console.log("measure: ", match);
  });
});
