import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/core@latest/dist/index.esm.js', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        // grab methods on Viewer2d prototype
        const str = "['adjustCameraByBBox']";
        const idx = data.indexOf(str);
        if (idx !== -1) {
            const body = data.substring(idx - 100, idx + 500);
            console.log(body);
        }
    });
});
