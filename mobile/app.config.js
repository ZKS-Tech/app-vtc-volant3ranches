// Complète app.json : sur Android, les notifications passent par Firebase (FCM). Le fichier
// google-services.json (console Firebase) est pris en compte dès qu'il est déposé dans mobile/.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const fichier = path.join(__dirname, 'google-services.json');
  if (fs.existsSync(fichier)) config.android = { ...config.android, googleServicesFile: './google-services.json' };
  return config;
};
