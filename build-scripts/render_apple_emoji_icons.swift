import AppKit
import Foundation

struct RenderJob: Decodable {
  let emoji: String
  let filename: String
}

struct RenderError: Error, CustomStringConvertible {
  let description: String
}

func pngData(for emoji: String, pixelSize: Int, font: NSFont) throws -> Data {
  let size = CGFloat(pixelSize)
  guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: pixelSize,
    pixelsHigh: pixelSize,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else {
    throw RenderError(description: "could not create bitmap")
  }

  // One point per pixel matches the 72-DPI PNGs extracted by fontkit.
  bitmap.size = NSSize(width: size, height: size)
  guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    throw RenderError(description: "could not create graphics context")
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  defer { NSGraphicsContext.restoreGraphicsState() }

  context.cgContext.clear(CGRect(x: 0, y: 0, width: size, height: size))

  let text = emoji as NSString
  let attributes: [NSAttributedString.Key: Any] = [.font: font]
  let textSize = text.size(withAttributes: attributes)
  text.draw(
    at: NSPoint(
      x: (size - textSize.width) / 2,
      y: (size - textSize.height) / 2
    ),
    withAttributes: attributes
  )

  guard let data = bitmap.representation(using: .png, properties: [:]) else {
    throw RenderError(description: "could not encode PNG")
  }
  return data
}

guard CommandLine.arguments.count == 3,
      let pixelSize = Int(CommandLine.arguments[1]), pixelSize > 0 else {
  fputs("usage: render_apple_emoji_icons.swift <pixel-size> <output-dir>\n", stderr)
  exit(1)
}

let outputDirectory = URL(
  fileURLWithPath: CommandLine.arguments[2],
  isDirectory: true
)

do {
  let input = FileHandle.standardInput.readDataToEndOfFile()
  let jobs = try JSONDecoder().decode([RenderJob].self, from: input)
  try FileManager.default.createDirectory(
    at: outputDirectory,
    withIntermediateDirectories: true
  )
  guard let font = NSFont(name: "AppleColorEmoji", size: CGFloat(pixelSize)) else {
    throw RenderError(description: "Apple Color Emoji font is unavailable")
  }

  for job in jobs {
    let data = try pngData(for: job.emoji, pixelSize: pixelSize, font: font)
    try data.write(to: outputDirectory.appendingPathComponent(job.filename))
  }
} catch {
  fputs("AppKit rendering failed: \(error)\n", stderr)
  exit(1)
}
