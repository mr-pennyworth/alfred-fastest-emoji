const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const { execSync } = require("child_process");
const {lookup} = require('lookup-dns-cache');

const PORT = 36363;

// https://nodejs.org/api/http.html#http_http_get_options_callback
const REQUEST_OPTS = {
  family: 4,
  lookup: lookup,
};

String.prototype.title = function() {
  return this.replace(/(^|\s)\S/g, (t) => t.toUpperCase());
};

// Negative indices for arrays
Array.prototype.get = function(i) {
  return this[(i + this.length) % this.length];
};

Array.prototype.makeMap = function(keyfunc) {
  return this.reduce(
    (dict, item) => {
      dict[keyfunc(item)] = item;
      return dict;
    },
    {});
};

const WF_DIR = process.cwd().split('/emoji-kitchen')[0];
const MAIN_EMOJI_JSON = `${WF_DIR}/alfreditems.json`;

const KITCHEN_DATA_DIR = (() => {
  var wf_data = process.env.alfred_workflow_data;
  if (!wf_data) {
    let HOME = process.env.HOME;
    wf_data = `${HOME}/Library/Application Support/Alfred` +
      '/Workflow Data/mr.pennyworth.fastEmoji';
  }

  let kitchen_data = `${wf_data}/kitchen_data`;
  if (!fs.existsSync(kitchen_data)) {
    fs.mkdirSync(kitchen_data, { recursive: true });
  }
  return kitchen_data;
})();


const emojiToInfoMap =
  JSON
    .parse(fs.readFileSync(MAIN_EMOJI_JSON))
    .items
    .makeMap((i) => stripVarSel(i.variables.emoji));


// All the results of querying emoji-kitchen go to
// the emoji fridge for easy later access.
function updateFridge(alfredItems) {
  let fridgePath = `${KITCHEN_DATA_DIR}/fridge.json`;
  var fridge = {'items': []};
  if (fs.existsSync(fridgePath)) {
    fridge = JSON.parse(fs.readFileSync(fridgePath));
  }
  let existing = new Set(fridge.items.map(i => i.uid));
  alfredItems.forEach((i) => {
    if (!existing.has(i.uid)) {
      fridge.items.push(i);
    }
  });
  fs.writeFileSync(fridgePath, JSON.stringify(fridge));
}

function parseTenorDataAndRespondToAlfred(tenorData, res, emoji, emoji2) {
  let downloadMonitor = new Map();
  let alfredItems = tenorData.results.map((tenorEntry) => {
    let pngPath = download(tenorEntry.url, downloadMonitor);
    let emojis = tenorEntry.tags;
    let emojiInfos = emojis.map((e) => emojiToInfoMap[stripVarSel(e)]);
    let keywords = emojiInfos.map(i => i.match).join(' ').split(' ');

    var uniqueKewords = [...new Set(keywords)].join(' ');
    var title = emojiInfos.map(i => i.title).join(' + ');
    if (emojis.length == 1) {
      uniqueKewords = 'double ' + uniqueKewords;
      title = 'double ' + title;
    }

    return {
      'arg': pngPath,
      'type': 'file:skipcheck',
      'uid': pngPath,
      'title': title,
      'match': uniqueKewords,
      'subtitle': uniqueKewords,
      'icon': {
        'path': pngPath
      }
    };
  });

  var responseItems = alfredItems;
  if (!emoji2) {
    let freshCookItem = {
      'arg': 'cook_new',
      'title': 'Cook Something New!',
      'subtitle': `Add another emoji to ${emoji} to make a new sticker`,
      'icon': {
        'path': 'cook-new.png'
      },
      'variables': {
        'emoji2': emoji
      }
    };
    responseItems = [freshCookItem].concat(alfredItems);
  }
  if (alfredItems.length == 0) {
    let sorryItem = {
      'valid': false,
      'title': 'Sorry, Empty Kitchen!',
      'icon': {
        'path': 'empty-kitchen.png'
      }
    };
    responseItems = [sorryItem].concat(responseItems);
  }

  // Busy-wait for downloads to finish
  var timeout = setInterval(function() {
    if (downloadMonitor.size == tenorData.results.length) {
      res.setHeader('Content-Type', 'application/json');
      res.write(JSON.stringify({'items': responseItems}));
      res.end();
      console.log('Responded to alfred');
      clearInterval(timeout); 
    }
  }, 50);

  updateFridge(alfredItems);
}


function download(pngUrl, downloadMonitor) {
  let pngName = pngUrl.split('/').get(-1);
  let pngPath = `${KITCHEN_DATA_DIR}/${pngName}`;

  if (!fs.existsSync(pngPath)) {
    const stream = fs.createWriteStream(pngPath);
    const getter = pngUrl.startsWith('https:') ? https : http;
    getter.get(pngUrl, REQUEST_OPTS, (response) => {
      console.log(`Downloading ${pngUrl}`);
      response.pipe(stream);
      downloadMonitor.set(pngUrl, true);
    });
  } else {
    downloadMonitor.set(pngUrl, true);
  }

  return pngPath;
}


function sendErrorToAlfred(res, error) {
  res.setHeader('Content-Type', 'application/json');
  res.write(JSON.stringify({
    'items': [{
      'title': 'Error: ' + error.message
    }]
  }));
  res.end();
}

// strip variation selectors
// Example: https://emojipedia.org/variation-selector-16/
function stripVarSel(emoj) {
  let varSel = /([\u180B-\u180D\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF])/g;
  return emoj.replace(varSel, '');
}

http.createServer(function (req, res) {
  let url = new URL(req.url, `http://${req.headers.host}`);
  var query = stripVarSel(url.searchParams.get('query'));
  var query2 = stripVarSel(url.searchParams.get('query2'));
  if (query2) {
    [query, query2] = [query2, query];
  }

  let emojiInfo = emojiToInfoMap[query];

  let scriptIconPath = `${WF_DIR}/DBEA5CCE-9222-4700-9C4D-E28F2C222532.png`;
  let script2IconPath = `${WF_DIR}/5D97EA1D-9B07-4355-9BAA-E2C508EEEB02.png`;
  let emojiIconPath = `${WF_DIR}/${emojiInfo.icon.path.replace('./', '')}`;
  execSync(`/bin/cp "${emojiIconPath}" "${scriptIconPath}"`);
  execSync(`/bin/cp "${emojiIconPath}" "${script2IconPath}"`);

  let api = new URL('https://tenor.googleapis.com/v2/featured');
  api.searchParams.append('key', 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ');
  api.searchParams.append('client_key', 'gboard');
  api.searchParams.append('contentfilter', 'high');
  api.searchParams.append('media_filter', 'png_transparent');
  api.searchParams.append('component', 'proactive');
  api.searchParams.append('collection', 'emoji_kitchen_v5');
  api.searchParams.append('locale', 'en_US');
  api.searchParams.append('country', 'US');
  api.searchParams.append('q', query2 ? `${query}_${query2}` : query);
  console.log(api);
  https.get(api, REQUEST_OPTS, (tenorRes) => {
    const { statusCode } = tenorRes;
    const contentType = tenorRes.headers['content-type'];

    let error;
    // Any 2xx status code signals a successful response but
    // here we're only checking for 200.
    if (statusCode !== 200) {
      error = new Error(
        `Request Failed.\nStatus Code: ${statusCode}`
      );
    } else if (!/^application\/json/.test(contentType)) {
      error = new Error(
        'Invalid content-type.\n' +
          `Expected application/json but received ${contentType}`
      );
    }

    if (error) {
      console.error(error.message);

      // Consume response data to free up memory
      tenorRes.resume();
      sendErrorToAlfred(res, error);
      return;
    }

    tenorRes.setEncoding('utf8');
    let rawData = '';
    tenorRes.on('data', (chunk) => { rawData += chunk; });
    tenorRes.on('end', () => {
      try {
        const tenorData = JSON.parse(rawData);
        parseTenorDataAndRespondToAlfred(tenorData, res, query, query2);
      } catch (e) {
        console.error(e.message);
        res.write(e.message);
        res.end();
      }
    });
  }).on('error', (e) => {
    console.error(`Got error: ${e.message}`);
    sendErrorToAlfred(res, e);
  });

  console.log(url.searchParams);
}).listen(PORT);
