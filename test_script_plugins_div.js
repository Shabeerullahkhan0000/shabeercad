import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/plugins@latest/dist/index.esm.js', res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    // "className" near "measure" or "document.createElement" ?
    let match = data.match(/.{0,50}\.createElement\([^)]*\).{0,250}/gi);
    if(match) {
        let lines = match.filter(m => m.includes('className') || m.includes('classList.add'));
        console.log("Plugins div: ", [...new Set(lines)]);
    }
  });
});
