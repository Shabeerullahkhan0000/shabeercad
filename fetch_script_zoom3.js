import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/core@latest/dist/index.esm.js', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const matches = data.match(/zoomExtents/g);
        console.log(matches ? "yes" : "no");
        
        const matchesFit = data.match(/fitToBox/g);
        console.log(matchesFit ? "yes fitToBox" : "no");
    });
});
