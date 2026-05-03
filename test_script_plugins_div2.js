import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/plugins@latest/dist/index.esm.js', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const startIndex = data.indexOf('class MeasurementPlugin');
    const ctor = data.substring(startIndex, startIndex + 1500);
    console.log(ctor);
  });
});
