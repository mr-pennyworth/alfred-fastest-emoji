#!/usr/bin/env swift

import Foundation

let apiKey = "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ"

struct EmojiInfo {
  let title: String
  let match: String
  let iconPath: String
}

enum KitchenError: Error {
  case message(String)
}

func stripVariationSelectors(_ value: String) -> String {
  var scalars = String.UnicodeScalarView()
  for scalar in value.unicodeScalars {
    let codePoint = scalar.value
    let isMongolianVariation =
      codePoint >= 0x180B && codePoint <= 0x180D
    let isVariationSelector =
      codePoint >= 0xFE00 && codePoint <= 0xFE0F
    let isSupplementaryVariation =
      codePoint >= 0xE0100 && codePoint <= 0xE01EF
    if isMongolianVariation ||
      isVariationSelector ||
      isSupplementaryVariation {
      continue
    }
    scalars.append(scalar)
  }
  return String(scalars)
}

func fetchData(from url: URL) throws -> Data {
  let semaphore = DispatchSemaphore(value: 0)
  var dataOut: Data?
  var statusCode = 0
  var contentType = ""
  var fetchError: Error?

  let task = URLSession.shared.dataTask(with: url) {
    data,
    response,
    error in
    dataOut = data
    fetchError = error
    if let httpRes = response as? HTTPURLResponse {
      statusCode = httpRes.statusCode
      contentType = httpRes.value(
        forHTTPHeaderField: "content-type"
      ) ?? ""
    }
    semaphore.signal()
  }
  task.resume()
  semaphore.wait()

  if let fetchError {
    throw fetchError
  }
  if statusCode != 200 {
    throw KitchenError.message(
      "Request Failed. Status Code: \(statusCode)"
    )
  }
  if !contentType.lowercased().contains("application/json") &&
    !url.pathExtension.lowercased().contains("png") {
    throw KitchenError.message(
      "Invalid content-type. Received \(contentType)"
    )
  }
  guard let dataOut else {
    throw KitchenError.message("No response data.")
  }
  return dataOut
}

func ensureDirectory(_ path: String) throws {
  try FileManager.default.createDirectory(
    atPath: path,
    withIntermediateDirectories: true
  )
}

func uniqueKeywords(_ keywords: [String]) -> String {
  var seen = Set<String>()
  var ordered = [String]()
  for keyword in keywords where !keyword.isEmpty {
    if !seen.contains(keyword) {
      seen.insert(keyword)
      ordered.append(keyword)
    }
  }
  return ordered.joined(separator: " ")
}

func loadEmojiMap(from path: String) throws -> [String: EmojiInfo] {
  let data = try Data(contentsOf: URL(fileURLWithPath: path))
  guard
    let root = try JSONSerialization.jsonObject(with: data)
      as? [String: Any],
    let items = root["items"] as? [[String: Any]]
  else {
    throw KitchenError.message("Unable to load alfreditems.json.")
  }

  var map = [String: EmojiInfo]()
  for item in items {
    guard
      let title = item["title"] as? String,
      let match = item["match"] as? String,
      let icon = item["icon"] as? [String: Any],
      let iconPath = icon["path"] as? String,
      let vars = item["variables"] as? [String: Any],
      let emoji = vars["emoji"] as? String
    else {
      continue
    }
    map[stripVariationSelectors(emoji)] = EmojiInfo(
      title: title,
      match: match,
      iconPath: iconPath
    )
  }
  return map
}

func copyIconFiles(workflowDir: String, emojiInfo: EmojiInfo) {
  let fm = FileManager.default
  let iconRel = emojiInfo.iconPath.replacingOccurrences(of: "./", with: "")
  let src = "\(workflowDir)/\(iconRel)"
  let targets = [
    "\(workflowDir)/DBEA5CCE-9222-4700-9C4D-E28F2C222532.png",
    "\(workflowDir)/5D97EA1D-9B07-4355-9BAA-E2C508EEEB02.png"
  ]
  for target in targets {
    do {
      if fm.fileExists(atPath: target) {
        try fm.removeItem(atPath: target)
      }
      try fm.copyItem(
        atPath: src,
        toPath: target
      )
    } catch {
      continue
    }
  }
}

func buildAPIURL(query: String) -> URL? {
  var comps = URLComponents(
    string: "https://tenor.googleapis.com/v2/featured"
  )
  comps?.queryItems = [
    URLQueryItem(name: "key", value: apiKey),
    URLQueryItem(name: "client_key", value: "gboard"),
    URLQueryItem(name: "contentfilter", value: "high"),
    URLQueryItem(name: "media_filter", value: "png_transparent"),
    URLQueryItem(name: "component", value: "proactive"),
    URLQueryItem(name: "collection", value: "emoji_kitchen_v5"),
    URLQueryItem(name: "locale", value: "en_US"),
    URLQueryItem(name: "country", value: "US"),
    URLQueryItem(name: "q", value: query)
  ]
  return comps?.url
}

func downloadPng(
  pngURL: String,
  kitchenDataDir: String,
  workflowDir: String
) throws -> String {
  guard let url = URL(string: pngURL) else {
    throw KitchenError.message("Invalid png URL.")
  }
  let fileName = url.lastPathComponent
  let outPath = "\(kitchenDataDir)/\(fileName)"
  if FileManager.default.fileExists(atPath: outPath) {
    return outPath
  }

  let data = try fetchData(from: url)
  try data.write(
    to: URL(fileURLWithPath: outPath),
    options: .atomic
  )

  let proc = Process()
  proc.executableURL = URL(
    fileURLWithPath: "\(workflowDir)/set_icon.sh"
  )
  proc.arguments = [outPath, outPath]
  try? proc.run()
  proc.waitUntilExit()
  return outPath
}

func updateFridge(
  kitchenDataDir: String,
  newItems: [[String: Any]]
) throws {
  let fridgePath = "\(kitchenDataDir)/fridge.json"
  var fridge: [String: Any] = ["items": []]
  if FileManager.default.fileExists(atPath: fridgePath) {
    let data = try Data(contentsOf: URL(fileURLWithPath: fridgePath))
    if let parsed = try JSONSerialization.jsonObject(with: data)
      as? [String: Any] {
      fridge = parsed
    }
  }

  var items = (fridge["items"] as? [[String: Any]]) ?? []
  var existing = Set<String>()
  for item in items {
    if let uid = item["uid"] as? String {
      existing.insert(uid)
    }
  }
  for item in newItems {
    guard let uid = item["uid"] as? String else {
      continue
    }
    if !existing.contains(uid) {
      existing.insert(uid)
      items.append(item)
    }
  }
  fridge["items"] = items
  let outData = try JSONSerialization.data(withJSONObject: fridge)
  try outData.write(
    to: URL(fileURLWithPath: fridgePath),
    options: .atomic
  )
}

func writeTmpJson(
  kitchenDataDir: String,
  items: [[String: Any]]
) throws -> String {
  let tmpPath = "\(kitchenDataDir)/tmp.json"
  let outObj: [String: Any] = ["items": items]
  let outData = try JSONSerialization.data(withJSONObject: outObj)
  try outData.write(
    to: URL(fileURLWithPath: tmpPath),
    options: .atomic
  )
  return tmpPath
}

func runKitchen() throws -> String {
  if CommandLine.arguments.count != 4 {
    throw KitchenError.message(
      "Usage: emoji-kitchen.bin <emoji1> <emoji2> <kitchen-data-dir>"
    )
  }

  var query = stripVariationSelectors(CommandLine.arguments[1])
  var query2 = stripVariationSelectors(CommandLine.arguments[2])
  let kitchenDataDir = CommandLine.arguments[3]
  let workflowDir = FileManager.default.currentDirectoryPath
  let mainJsonPath = "\(workflowDir)/alfreditems.json"
  try ensureDirectory(kitchenDataDir)
  let emojiMap = try loadEmojiMap(from: mainJsonPath)

  if !query2.isEmpty {
    let q = query
    query = query2
    query2 = q
  }

  guard let emojiInfo = emojiMap[query] else {
    throw KitchenError.message("Unknown emoji query: \(query)")
  }
  copyIconFiles(
    workflowDir: workflowDir,
    emojiInfo: emojiInfo
  )

  let searchQuery = query2.isEmpty ? query : "\(query)_\(query2)"
  guard let apiURL = buildAPIURL(query: searchQuery) else {
    throw KitchenError.message("Failed to build API URL.")
  }
  let data = try fetchData(from: apiURL)
  guard
    let root = try JSONSerialization.jsonObject(with: data)
      as? [String: Any],
    let results = root["results"] as? [[String: Any]]
  else {
    throw KitchenError.message("Invalid Tenor response JSON.")
  }

  var alfredItems = [[String: Any]]()
  for result in results {
    guard
      let pngURL = result["url"] as? String,
      let tags = result["tags"] as? [String]
    else {
      continue
    }
    let pngPath = try downloadPng(
      pngURL: pngURL,
      kitchenDataDir: kitchenDataDir,
      workflowDir: workflowDir
    )
    var infos = [EmojiInfo]()
    for tag in tags {
      let key = stripVariationSelectors(tag)
      if let info = emojiMap[key] {
        infos.append(info)
      }
    }

    let allKeywords = infos
      .map { $0.match }
      .joined(separator: " ")
      .split(separator: " ")
      .map { String($0) }
    var keywords = uniqueKeywords(allKeywords)
    var title = infos.map { $0.title }.joined(separator: " + ")
    if tags.count == 1 {
      keywords = "double \(keywords)"
      title = "double \(title)"
    }
    let item: [String: Any] = [
      "arg": pngPath,
      "type": "file:skipcheck",
      "uid": pngPath,
      "title": title,
      "match": keywords,
      "subtitle": keywords,
      "icon": [
        "path": pngPath
      ]
    ]
    alfredItems.append(item)
  }

  var responseItems = alfredItems
  if query2.isEmpty {
    let freshCook: [String: Any] = [
      "arg": "cook_new",
      "title": "Cook Something New!",
      "subtitle": "Add another emoji to \(query) to make a new sticker",
      "icon": ["path": "cook-new.png"],
      "variables": ["emoji2": query]
    ]
    responseItems.insert(freshCook, at: 0)
  }
  if alfredItems.isEmpty {
    let sorry: [String: Any] = [
      "valid": false,
      "title": "Sorry, Empty Kitchen!",
      "icon": ["path": "empty-kitchen.png"]
    ]
    responseItems.insert(sorry, at: 0)
  }

  try updateFridge(
    kitchenDataDir: kitchenDataDir,
    newItems: alfredItems
  )
  let tmpPath = try writeTmpJson(
    kitchenDataDir: kitchenDataDir,
    items: responseItems
  )
  return tmpPath
}

do {
  let path = try runKitchen()
  print(path)
} catch {
  let kitchenDataDir = CommandLine.arguments.count >= 4
    ? CommandLine.arguments[3]
    : ""
  let message = (error as? KitchenError).map {
    if case let .message(msg) = $0 {
      return msg
    }
    return "Unknown error."
  } ?? error.localizedDescription

  if !kitchenDataDir.isEmpty {
    try? ensureDirectory(kitchenDataDir)
    _ = try? writeTmpJson(
      kitchenDataDir: kitchenDataDir,
      items: [["title": "Error: \(message)"]]
    )
  }
  fputs("Error: \(message)\n", stderr)
  exit(1)
}
