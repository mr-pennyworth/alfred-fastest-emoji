// Run with: /usr/bin/osascript -l JavaScript emoji-kitchen.js <emoji1> <emoji2> <data-dir>
ObjC.import('Foundation');
ObjC.import('AppKit');

var apiKey = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
var fileManager = $.NSFileManager.defaultManager;

function stripVariationSelectors(value) {
  return value.replace(/[\u180B-\u180D\uFE00-\uFE0F]|\uDB40[\uDD00-\uDDEF]/g, '');
}

function ensureDirectory(path) {
  if (!fileManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
    path, true, $(), null
  )) {
    throw new Error('Cannot create directory: ' + path);
  }
}

function readJSON(path) {
  var contents = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(
    path, $.NSUTF8StringEncoding, null
  ));
  if (typeof contents !== 'string') {
    throw new Error('Cannot read file: ' + path);
  }
  return JSON.parse(contents);
}

function writeJSON(path, value) {
  if (!$(JSON.stringify(value)).writeToFileAtomicallyEncodingError(
    path, true, $.NSUTF8StringEncoding, null
  )) {
    throw new Error('Cannot write file: ' + path);
  }
  return path;
}

// Run callbacks on this thread. JXA cannot safely run JavaScript callbacks
// on URLSession's background threads or retain an autoreleased response via Ref().
var fetchState;
ObjC.registerSubclass({
  name: 'EmojiKitchenConnectionDelegate',
  superclass: 'NSObject',
  methods: {
    'connection:didReceiveResponse:': {
      types: ['void', ['id', 'id']],
      implementation: function(connection, response) {
        fetchState.statusCode = Number(response.statusCode);
        fetchState.contentType = ObjC.unwrap(response.valueForHTTPHeaderField('content-type')) || '';
        fetchState.data.length = 0;
      }
    },
    'connection:didReceiveData:': {
      types: ['void', ['id', 'id']],
      implementation: function(connection, data) { fetchState.data.appendData(data); }
    },
    'connectionDidFinishLoading:': {
      types: ['void', ['id']],
      implementation: function() { fetchState.done = true; }
    },
    'connection:didFailWithError:': {
      types: ['void', ['id', 'id']],
      implementation: function(connection, error) {
        fetchState.error = ObjC.unwrap(error.localizedDescription);
        fetchState.done = true;
      }
    }
  }
});

function fetchData(url, expectedType) {
  if (!url || url.isNil() || !/^https?$/.test(ObjC.unwrap(url.scheme) || '')) {
    throw new Error('Invalid request URL.');
  }
  var request = $.NSURLRequest.requestWithURLCachePolicyTimeoutInterval(
    url, $.NSURLRequestReloadIgnoringLocalCacheData, 60
  );
  fetchState = { data: $.NSMutableData.data, done: false, statusCode: 0, contentType: '' };
  var delegate = $.EmojiKitchenConnectionDelegate.alloc.init;
  var connection = $.NSURLConnection.alloc.initWithRequestDelegateStartImmediately(
    request, delegate, false
  );
  connection.start;
  var deadline = Date.now() + 60000;
  while (!fetchState.done && Date.now() < deadline) {
    $.NSRunLoop.currentRunLoop.runModeBeforeDate(
      $.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.1)
    );
  }
  if (!fetchState.done || fetchState.error) {
    connection.cancel;
    throw new Error('Request failed: ' + (fetchState.error || 'Timed out.'));
  }
  if (fetchState.statusCode !== 200) {
    throw new Error('Request Failed. Status Code: ' + fetchState.statusCode);
  }
  expectedType = expectedType || 'application/json';
  var contentType = fetchState.contentType.split(';')[0].trim().toLowerCase();
  if (contentType !== expectedType) {
    throw new Error('Invalid content-type. Received ' + fetchState.contentType);
  }
  return fetchState.data;
}

function uniqueKeywords(keywords) {
  var seen = Object.create(null);
  return keywords.filter(function(keyword) {
    if (!keyword || seen[keyword]) return false;
    seen[keyword] = true;
    return true;
  }).join(' ');
}

function loadEmojiMap(path) {
  var root = readJSON(path);
  if (!root || !Array.isArray(root.items)) {
    throw new Error('Unable to load alfreditems.json.');
  }
  var map = Object.create(null);
  root.items.forEach(function(item) {
    if (!item || typeof item.title !== 'string' || typeof item.match !== 'string' ||
        !item.icon || typeof item.icon.path !== 'string' ||
        !item.variables || typeof item.variables.emoji !== 'string') return;
    map[stripVariationSelectors(item.variables.emoji)] = {
      title: item.title, match: item.match, iconPath: item.icon.path
    };
  });
  return map;
}

function copyIconFiles(workflowDir, emojiInfo) {
  var source = workflowDir + '/' + emojiInfo.iconPath.replace(/^\.\//, '');
  ['DBEA5CCE-9222-4700-9C4D-E28F2C222532.png',
   '5D97EA1D-9B07-4355-9BAA-E2C508EEEB02.png'].forEach(function(name) {
    var target = workflowDir + '/' + name;
    if (fileManager.fileExistsAtPath(target)) {
      fileManager.removeItemAtPathError(target, null);
    }
    fileManager.copyItemAtPathToPathError(source, target, null);
  });
}

function buildAPIURL(query) {
  var parameters = {
    key: apiKey, client_key: 'gboard', contentfilter: 'high',
    media_filter: 'png_transparent', component: 'proactive',
    collection: 'emoji_kitchen_v5', locale: 'en_US', country: 'US', q: query
  };
  var queryString = Object.keys(parameters).map(function(name) {
    return encodeURIComponent(name) + '=' + encodeURIComponent(parameters[name]);
  }).join('&');
  return $.NSURL.URLWithString('https://tenor.googleapis.com/v2/featured?' + queryString);
}

function isPng(data) {
  return data && !data.isNil() && Number(data.length) >= 8 &&
    ObjC.unwrap(data.subdataWithRange($.NSMakeRange(0, 8)).base64EncodedStringWithOptions(0)) ===
      'iVBORw0KGgo=';
}

function downloadPng(pngURL, kitchenDataDir) {
  var url = $.NSURL.URLWithString(pngURL);
  if (!url || url.isNil() || !/^https?$/.test(ObjC.unwrap(url.scheme) || '')) {
    throw new Error('Invalid png URL.');
  }
  var fileName = ObjC.unwrap(url.lastPathComponent);
  if (!fileName || fileName === '.' || fileName === '..' || /[\/\u0000]/.test(fileName)) {
    throw new Error('Invalid png filename.');
  }
  var outPath = kitchenDataDir + '/' + fileName;
  if (fileManager.fileExistsAtPath(outPath) && isPng($.NSData.dataWithContentsOfFile(outPath))) {
    return outPath;
  }

  var data = fetchData(url, 'image/png');
  if (!isPng(data)) throw new Error('Invalid PNG data.');
  if (!data.writeToFileAtomically(outPath, true)) {
    throw new Error('Cannot write file: ' + outPath);
  }
  // Custom Finder icons are optional. A failure must not stop the download.
  try {
    var image = $.NSImage.alloc.initWithContentsOfFile(outPath);
    if (image && !image.isNil()) {
      $.NSWorkspace.sharedWorkspace.setIconForFileOptions(image, outPath, 0);
    }
  } catch (iconError) {
    // Keep the cached PNG if Finder cannot set its icon.
  }
  return outPath;
}

function updateFridge(kitchenDataDir, newItems) {
  var path = kitchenDataDir + '/fridge.json';
  var fridge = { items: [] };
  if (fileManager.fileExistsAtPath(path)) {
    var parsed = readJSON(path);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) fridge = parsed;
  }
  var items = Array.isArray(fridge.items) ? fridge.items : [];
  var existing = Object.create(null);
  items.forEach(function(item) {
    if (item && typeof item.uid === 'string') existing[item.uid] = true;
  });
  newItems.forEach(function(item) {
    if (typeof item.uid === 'string' && !existing[item.uid]) {
      existing[item.uid] = true;
      items.push(item);
    }
  });
  fridge.items = items;
  writeJSON(path, fridge);
}

function writeTmpJson(kitchenDataDir, items) {
  return writeJSON(kitchenDataDir + '/tmp.json', { items: items });
}

function copyImage(path) {
  var image = $.NSImage.alloc.initWithContentsOfFile(path);
  if (!image || image.isNil()) throw new Error('Cannot load image: ' + path);
  var png = $.NSData.dataWithContentsOfFile(path);
  var tiff = image.TIFFRepresentation;
  if (!isPng(png) || !tiff || tiff.isNil()) throw new Error('Cannot load image: ' + path);
  var pasteboard = $.NSPasteboard.generalPasteboard;
  pasteboard.clearContents;
  if (!pasteboard.setDataForType(png, $.NSPasteboardTypePNG) ||
      !pasteboard.setDataForType(tiff, $.NSPasteboardTypeTIFF)) {
    throw new Error('Cannot copy image to clipboard.');
  }
}

function runKitchen(args) {
  if (args.length !== 3) {
    throw new Error('Usage: emoji-kitchen.js <emoji1> <emoji2> <kitchen-data-dir>');
  }
  var query = stripVariationSelectors(args[0]);
  var query2 = stripVariationSelectors(args[1]);
  var kitchenDataDir = args[2];
  var workflowDir = ObjC.unwrap(fileManager.currentDirectoryPath);
  ensureDirectory(kitchenDataDir);
  var emojiMap = loadEmojiMap(workflowDir + '/alfreditems.json');

  if (query2) {
    var firstQuery = query;
    query = query2;
    query2 = firstQuery;
  }
  var emojiInfo = emojiMap[query];
  if (!emojiInfo) throw new Error('Unknown emoji query: ' + query);
  copyIconFiles(workflowDir, emojiInfo);

  var data = fetchData(buildAPIURL(query2 ? query + '_' + query2 : query));
  var text = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
  var root = JSON.parse(text);
  if (!root || !Array.isArray(root.results)) {
    throw new Error('Invalid Tenor response JSON.');
  }

  var alfredItems = [];
  root.results.forEach(function(result) {
    if (!result || typeof result.url !== 'string' || !Array.isArray(result.tags) ||
        !result.tags.every(function(tag) { return typeof tag === 'string'; })) return;
    var pngPath = downloadPng(result.url, kitchenDataDir);
    var infos = result.tags.map(function(tag) {
      return emojiMap[stripVariationSelectors(tag)];
    }).filter(function(info) { return !!info; });
    var keywords = uniqueKeywords(infos.map(function(info) {
      return info.match;
    }).join(' ').split(' '));
    var title = infos.map(function(info) { return info.title; }).join(' + ');
    if (result.tags.length === 1) {
      keywords = 'double ' + keywords;
      title = 'double ' + title;
    }
    alfredItems.push({
      arg: pngPath, type: 'file:skipcheck', uid: pngPath, title: title,
      match: keywords, subtitle: keywords, icon: { path: pngPath }
    });
  });

  var responseItems = alfredItems.slice();
  if (!query2) {
    responseItems.unshift({
      arg: 'cook_new', title: 'Cook Something New!',
      subtitle: 'Add another emoji to ' + query + ' to make a new sticker',
      icon: { path: 'cook-new.png' }, variables: { emoji2: query }
    });
  }
  if (!alfredItems.length) {
    responseItems.unshift({
      valid: false, title: 'Sorry, Empty Kitchen!', icon: { path: 'empty-kitchen.png' }
    });
  }
  updateFridge(kitchenDataDir, alfredItems);
  return writeTmpJson(kitchenDataDir, responseItems);
}

function run(args) {
  if (args[0] === '--copy-image') {
    if (args.length !== 2) throw new Error('Usage: emoji-kitchen.js --copy-image <png-file>');
    copyImage(args[1]);
    return;
  }
  try {
    return runKitchen(args);
  } catch (error) {
    if (args.length >= 3 && args[2]) {
      try {
        ensureDirectory(args[2]);
        writeTmpJson(args[2], [{ valid: false, title: 'Error: ' + error.message }]);
      } catch (writeError) {
        // Keep the original error if the error result cannot be saved.
      }
    }
    throw error;
  }
}
