// Enregistre presentation.html image par image et encode la vidéo (H.264, 1920×1080, 30 i/s).
// Usage, depuis site/ avec un serveur local sur le port 8765 : node video/enregistrer.js [vertical]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const IPS = 30, VERTICAL = process.argv[2] === 'vertical';
  const [LARG, HAUT] = VERTICAL ? [1080, 1920] : [1920, 1080];
  const SORTIE = VERTICAL ? 'video/volant3ranches-presentation-9x16.mp4' : 'video/volant3ranches-presentation.mp4';
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: LARG, height: HAUT } });
  await pg.goto('http://localhost:8765/video/presentation.html' + (VERTICAL ? '?format=vertical' : ''));
  const { duree } = await pg.evaluate(() => window.pret);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(IPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', 'video/musique.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', SORTIE], { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = Math.round(duree * IPS);
  for (let i = 0; i < N; i++) {
    await pg.evaluate(t => rendre(t), i / IPS);
    const img = await pg.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`image ${i}/${N}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await b.close();
  console.log('terminé');
})();
