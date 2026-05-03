import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/ui@latest/dist/index.esm.js', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    let match = data.match(/class Tooltip.{0,1000}/gi);
    if(match) console.log(match);
  });
});
