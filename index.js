const fs = require('fs');
const http = require('http');
const https = require('https');
const minimist = require('minimist');
const FormData = require('form-data');
const archiver = require('archiver');

const EXOPORT_HOSTNAME = `https://build.webmr.io`;
const EXOPORT_URL = `${EXOPORT_HOSTNAME}/mpk`;

const args = minimist(process.argv.slice(2), {
  string: [
    'appName',
    'packageName',
    'buildType',
    'model',
    'portal',
    'content',
    'output',
    'cert',
    'privkey',
  ],
  alias: {
    a: 'appName',
    p: 'packageName',
    m: 'model',
    r: 'portal',
    f: 'content',
    o: 'output',
    c: 'cert',
    k: 'privkey',
  },
});

let {
  appName,
  packageName,
  buildType,
  model: modelPath,
  portal: portalPath,
  content: contentPath,
  output: outputPath,
  cert: certPath,
  privkey: privkeyPath,
} = args;
if (!buildType) {
  buildType = 'debug';
}

const _readFile = p => new Promise((accept, reject) => {
  fs.readFile(p, (err, data) => {
    if (!err) {
      accept(data);
    } else {
      reject(err);
    }
  });
});
const _readDirectory = p => new Promise((accept, reject) => {
  fs.lstat(p, (err, stats) => {
    if (!err && stats.isDirectory()) {
      const archive = archiver('zip', {
        zlib: {
          level: 9,
        },
      });
      const bs = [];
      archive.on('data', d => {
        bs.push(d);
      });
      archive.on('end', () => {
        const b = Buffer.concat(bs);
        fs.writeFileSync('/tmp/lol.zip', b);
        accept(b);
      });
      archive.on('error', reject);

      archive.directory(p, '/');
      archive.finalize();
    } else {
      reject(new Error(`${p} is not a directory`));
    }
  });
});

let valid = true;
if (!appName) {
  console.warn('missing appName');
  valid = false;
}
if (!packageName) {
  console.warn('missing appName');
  valid = false;
}
if (!['production', 'debug'].includes(buildType)) {
  console.warn('invalid buildType');
  valid = false;
}
if (!contentPath) {
  console.warn('invalid contentPath');
  valid = false;
}
if (!outputPath) {
  console.warn('invalid outputPath');
  valid = false;
}
if (!privkeyPath) {
  console.warn('invalid privkeyPath');
  valid = false;
}
if (valid) {
  console.log('got args', {
    appName,
    packageName,
    buildType,
    contentPath,
    outputPath,
    modelPath,
    portalPath,
    certPath,
    privkeyPath,
  });

  (async () => {
    console.log('form 1');
    const form = new FormData();

    form.append('appname', appName);
    form.append('packagename', packageName);
    form.append('buildtype', buildType);

    console.log('form 2');

    const contentBuffer = await _readDirectory(contentPath);
    console.log('got content buffer', contentBuffer.constructor.name, contentBuffer.byteLength);
    form.append('app.zip', contentBuffer, {
      filename: 'app.zip',
    });

    console.log('form 3');

    if (modelPath) {
      const modelBuffer = await _readFile(modelPath);
      form.append('model.zip', modelBuffer, {
        filename: 'model.zip',
      });
    }
    if (portalPath) {
      const portalBuffer = await _readFile(portalPath);
      form.append('portal.zip', portalBuffer, {
        filename: 'portal.zip',
      });
    }

    console.log('form 4');

    const certBuffer = await _readFile(certPath);
    form.append('app.cert', certBuffer);

    const privkeyBuffer = await _readFile(privkeyPath);
    form.append('app.privkey', privkeyBuffer);

    console.log('form 5');

    const u = await new Promise((accept, reject) => {
      form.submit(EXOPORT_URL, (err, res) => {
        if (!err) {
          console.log(res.headers);
          const bs = [];
          res.on('data', d => {
            bs.push(d);
          });
          res.on('end', () => {
            const b = Buffer.concat(bs);
            const s = b.toString('utf8');
            const j = JSON.parse(s);
            const {url} = j;
            accept(url);
          });
          res.on('error', reject);
        } else {
          reject(err);
        }
      });
    });

    await new Promise((accept, reject) => {
      const req = (/^https:/.test(EXOPORT_HOSTNAME) ? https : http).get(`${EXOPORT_HOSTNAME}${u}`, res => {
        const ws = fs.createWriteStream(outputPath);
        res.pipe(ws);
        ws.on('finish', () => {
          accept();
        });
        ws.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });

    console.log('form 6', u);
  })()
    .catch(err => {
      console.warn(err.stack);
    });
} else {
  console.warn('invalid arugments');
}