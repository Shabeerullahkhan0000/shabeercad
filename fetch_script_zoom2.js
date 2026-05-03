import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/core@latest/dist/index.esm.js', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const matches = data.match(/\['(zoomToBBox|flyToBox|fitToBox)'\]/g);
        console.log(matches);
        const idx = data.indexOf("['zoomToBBox']");
        if(idx !== -1) console.log(data.substring(idx - 100, idx + 200));

        const idx2 = data.indexOf("['fitToBox']");
        if(idx2 !== -1) console.log(data.substring(idx2 - 100, idx2 + 200));
    });
});
