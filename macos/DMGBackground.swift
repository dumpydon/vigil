import AppKit

// A code-drawn, two-times-resolution installation backdrop; no external assets.
let destination = CommandLine.arguments[1]
let size = NSSize(width: 560, height: 340)
let image = NSImage(size: size)
image.lockFocus()
NSColor(calibratedRed: 0.035, green: 0.037, blue: 0.047, alpha: 1).setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
let glow = NSGradient(colors: [
    NSColor(calibratedRed: 0.18, green: 0.18, blue: 0.30, alpha: 0.55),
    NSColor(calibratedRed: 0.035, green: 0.037, blue: 0.047, alpha: 0)
])!
glow.draw(fromCenter: NSPoint(x: 280, y: 130), radius: 5, toCenter: NSPoint(x: 280, y: 130), radius: 310, options: [.drawsBeforeStartingLocation, .drawsAfterEndingLocation])
func text(_ value: String, y: CGFloat, font: NSFont, color: NSColor) {
    let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center
    (value as NSString).draw(in: NSRect(x: 24, y: y, width: 512, height: 35), withAttributes: [.font: font, .foregroundColor: color, .paragraphStyle: paragraph])
}
text("Apply Vigil", y: 271, font: .systemFont(ofSize: 25, weight: .bold), color: NSColor(calibratedWhite: 0.95, alpha: 1))
text("A quiet watch on your applications.", y: 244, font: .systemFont(ofSize: 12), color: NSColor(calibratedWhite: 0.61, alpha: 1))
let arrow = NSBezierPath()
arrow.move(to: NSPoint(x: 248, y: 179)); arrow.line(to: NSPoint(x: 311, y: 179))
arrow.move(to: NSPoint(x: 300, y: 190)); arrow.line(to: NSPoint(x: 311, y: 179)); arrow.line(to: NSPoint(x: 300, y: 168))
arrow.lineWidth = 2.3; arrow.lineCapStyle = .round; arrow.lineJoinStyle = .round
NSColor(calibratedRed: 0.51, green: 0.55, blue: 0.97, alpha: 0.8).setStroke(); arrow.stroke()
text("Drag Apply Vigil to Applications", y: 45, font: .systemFont(ofSize: 13, weight: .medium), color: NSColor(calibratedWhite: 0.8, alpha: 1))
text("Then open it from Applications. Look for its icon in your menu bar.", y: 19, font: .systemFont(ofSize: 10), color: NSColor(calibratedWhite: 0.53, alpha: 1))
image.unlockFocus()
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1120, pixelsHigh: 680, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
bitmap.size = size
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
image.draw(in: NSRect(origin: .zero, size: size))
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: destination))
