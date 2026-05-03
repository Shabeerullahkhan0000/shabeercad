import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/plugins@latest/dist/index.esm.js', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const startIndex = data.indexOf("['initLocalization'](){");
    const initLoc = data.substring(startIndex, startIndex + 500);
    console.log(initLoc);
  });
});
