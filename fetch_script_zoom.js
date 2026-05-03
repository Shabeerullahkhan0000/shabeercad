import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/core@latest/dist/index.esm.js', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const matches = data.match(/\['(zoom[^']+)'\]/g);
        if (matches) {
            console.log([...new Set(matches.map(m => m.slice(2, -2)))]);
        }
        const matches2 = data.match(/\['(fly[^']+)'\]/g);
        if (matches2) {
            console.log([...new Set(matches2.map(m => m.slice(2, -2)))]);
        }
        const matches3 = data.match(/\['(fit[^']+)'\]/g);
        if (matches3) {
            console.log([...new Set(matches3.map(m => m.slice(2, -2)))]);
        }
    });
});
