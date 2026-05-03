import https from 'https';
https.get('https://cdn.jsdelivr.net/npm/@x-viewer/plugins@latest/dist/index.esm.js', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const str = "(_0x539991){this['activeMeasurementType']&&this['deactivate']()";
        const index = data.indexOf(str);
        if (index !== -1) {
            const part = data.substring(index - 50, index + 50);
            console.log(part);
        }
    });
});
